/** biome-ignore-all lint/style/useImportType: Needed for NestJS DI (emitDecoratorMetadata) to resolve JobTextExtractorService and ScraperHttpService at runtime. */
import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';
import { StructuredLogger } from '../../common/logger/structured.logger.js';
import { normalizeJobText } from '../../scraper/job-normalizer.js';
import { ScraperService } from '../../scraper/service/scraper.service.js';
import { signJobAccessToken } from '../auth/job-access-token.js';
import type { AnalyzeJobDto, UserProfileDto } from '../dto/analyze-job.dto.js';
import type { JobResponseDto } from '../dto/job-response.dto.js';
import type { JobRecord } from '../jobs/job-record.types.js';
import { JobsService } from '../jobs/jobs.service.js';
import { mapJobRecordToJobResponseDto, mapJobRecordToPostJobResponseDto } from '../mappers/job-response.mapper.js';
import { ANALYSIS_QUEUE_NAME, type AnalysisQueueJobPayload } from '../queue/analysis-queue.constants.js';
import { buildParseFailureResult } from '../utils/analysis-fallbacks.js';
import { effectiveUserProfile } from '../utils/effective-user-profile.js';
import { JobDescriptionAnalysisService } from './job-description-analysis.service.js';
import { StrategyAndMessageService } from './strategy-and-message.service.js';

const MAX_QUEUE_DEPTH = 50;
// Bump this when prompt semantics change so stale AI outputs are not reused.
const ANALYSIS_PROMPT_CACHE_VERSION = '2026-05-10-zero-profile-fallback-bridge-v9';
// Token/cost guardrails for AI provider (char-based approximation).
const MAX_AI_JOB_TEXT_CHARS = 35000;
const AI_JOB_TEXT_HEAD_CHARS = 25000;
const AI_JOB_TEXT_TAIL_CHARS = 10000;

function truncateForAi(text: string): string {
  if (text.length <= MAX_AI_JOB_TEXT_CHARS) return text;

  const head = text.slice(0, AI_JOB_TEXT_HEAD_CHARS).trimEnd();
  const tail = text.slice(-AI_JOB_TEXT_TAIL_CHARS).trimStart();

  return `${head}\n\n[... truncated ...]\n\n${tail}`;
}

export type AnalysisPipelineInput = {
  readonly jobId: string;
  readonly dto: AnalyzeJobDto;
  readonly cacheKey: string;
};

type AnalyzeResult = {
  readonly status?: string;
  readonly fallbacks?: ReadonlyArray<{ step: string; reason?: string }>;
};

type AnalyzePipelineFallback = { step: string; reason?: string };

function pipelineStatusFromFallbacks(fallbacks: AnalyzePipelineFallback[]): 'complete' | 'partial' {
  return fallbacks.length === 0 ? 'complete' : 'partial';
}

function shouldCacheAnalysisResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  const fallbacks = (result as { fallbacks?: ReadonlyArray<{ step: string }> }).fallbacks;
  if (!Array.isArray(fallbacks) || fallbacks.length === 0) return true;
  return !fallbacks.some((f) => f.step === 'strategyAndMessage');
}

@Injectable()
export class AnalysisPipelineService {
  private logger = new StructuredLogger(AnalysisPipelineService.name);
  /** Serializes overlapping submits for the same cache key so parallel POSTs do not return stale bodies. */
  private readonly submitChainByCacheKey = new Map<string, Promise<JobResponseDto>>();

  constructor(
    private readonly jobDescriptionAnalysis: JobDescriptionAnalysisService,
    private readonly strategyAndMessage: StrategyAndMessageService,
    private readonly scraperService: ScraperService,
    private readonly jobsService: JobsService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Optional() @InjectQueue(ANALYSIS_QUEUE_NAME) private readonly analysisQueue?: Queue<AnalysisQueueJobPayload>,
  ) {}

  async getJob(id: string): Promise<JobResponseDto> {
    const job: JobRecord = await this.jobsService.get(id);
    return mapJobRecordToJobResponseDto(job);
  }

  async submit(dto: AnalyzeJobDto): Promise<JobResponseDto> {
    const cacheKey: string = this.buildCacheKey(dto);
    const previous = this.submitChainByCacheKey.get(cacheKey) ?? Promise.resolve({} as JobResponseDto);
    const current: Promise<JobResponseDto> = previous.then(
      (): Promise<JobResponseDto> => this.submitExclusive(dto, cacheKey),
      (): Promise<JobResponseDto> => this.submitExclusive(dto, cacheKey),
    );
    this.submitChainByCacheKey.set(cacheKey, current);
    current.finally(() => {
      if (this.submitChainByCacheKey.get(cacheKey) === current) {
        this.submitChainByCacheKey.delete(cacheKey);
      }
    });
    return current;
  }

  private async submitExclusive(dto: AnalyzeJobDto, cacheKey: string): Promise<JobResponseDto> {
    const pending: number = await this.jobsService.countPending();
    if (pending >= MAX_QUEUE_DEPTH) {
      throw new HttpException('Queue at capacity — try again shortly', HttpStatus.TOO_MANY_REQUESTS);
    }

    const cached: unknown = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.event('cache_hit', { cacheKey: cacheKey.slice(0, 16) });
      const jobFromCache: JobRecord = await this.jobsService.createCompleted(cached);
      return mapJobRecordToPostJobResponseDto(jobFromCache, this.createAccessToken(jobFromCache.id));
    }

    const job: JobRecord = await this.jobsService.create();
    const payload: AnalysisQueueJobPayload = { jobId: job.id, dto, cacheKey };
    this.logger.event('pipeline_enqueued', { jobId: job.id });

    if (this.analysisQueue) {
      await this.analysisQueue.add('analyze', payload, {
        jobId: job.id,
        removeOnComplete: true,
        removeOnFail: false,
      });
    } else {
      void this.runPipelineInProcess(payload);
    }

    return mapJobRecordToPostJobResponseDto(job, this.createAccessToken(job.id));
  }

  /** Dev fallback when BullMQ is not configured — same process, non-blocking POST. */
  private async runPipelineInProcess(payload: AnalysisQueueJobPayload): Promise<void> {
    try {
      await this.jobsService.setProcessing(payload.jobId);
      await this.runPipeline(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.errorEvent('pipeline_in_process_failed', { jobId: payload.jobId, error: message });
    }
  }

  async runPipeline(input: AnalysisPipelineInput): Promise<void> {
    const { jobId, dto, cacheKey } = input;
    try {
      const providedJobText = dto.jobText?.trim();
      const scrapedJobText = providedJobText ? null : await this.scraperService.fetchJobText(dto.jobUrl);

      const normalizedJobText = normalizeJobText(providedJobText ?? scrapedJobText ?? '');
      const jobText = truncateForAi(normalizedJobText);

      const userProfile = effectiveUserProfile(dto.userProfile);
      const result: AnalyzeResult = (await this.runAnalyzeAndOutreach(jobId, jobText, userProfile)) as AnalyzeResult;

      if (shouldCacheAnalysisResult(result)) {
        await this.cacheManager.set(cacheKey, result);
      } else {
        this.logger.event('cache_skip', {
          reason: 'strategy_message_fallback',
          jobId,
          cacheKeyPrefix: cacheKey.slice(0, 16),
        });
      }

      if (result.status === 'partial') {
        await this.jobsService.setPartial(jobId, result);
        return;
      }

      await this.jobsService.setCompleted(jobId, result);
    } catch (err: unknown) {
      const formatted = this.formatPipelineError(err);
      await this.jobsService.setFailed(jobId, formatted.message, formatted.code);
    }
  }

  /** Parse job posting text, then generate strategy + outreach. */
  async runAnalyzeAndOutreach(jobId: string, jobText: string, userProfile: UserProfileDto | undefined): Promise<unknown> {
    const hasTrustedProfile = userProfile !== undefined;
    const timings: Record<string, number> = {};
    const fallbacks: AnalyzePipelineFallback[] = [];

    const parseResult = await this.jobDescriptionAnalysis.parsePosting(jobText);

    if (!parseResult.fallback) {
      timings.parseJobAndTruth = parseResult.durationMs;
    } else {
      this.logger.errorEvent('pipeline_aborted', {
        jobId,
        step: 'parseJobAndTruth',
        reason: parseResult.error,
      });

      return buildParseFailureResult(parseResult.error ?? 'Parse step failed', parseResult.durationMs);
    }

    const { job, insights } = parseResult.data;

    const sm = await this.strategyAndMessage.runWithFallbacks(job, insights, userProfile, hasTrustedProfile);

    timings.strategyAndMessage = sm.durationMs;

    if (sm.strategyStepFallback !== null) {
      fallbacks.push({
        step: 'strategyAndMessage',
        reason: sm.strategyStepFallback.reason,
      });
    }

    const status = pipelineStatusFromFallbacks(fallbacks);

    this.logger.event('pipeline_complete', {
      jobId,
      status,
      fallbackSteps: fallbacks.map((f) => f.step),
      ...Object.fromEntries(Object.entries(timings).map(([k, v]) => [`${k}Ms`, v])),
    });

    return {
      job,
      insights,
      strategy: sm.strategy,
      message: sm.message,
      status,
      fallbacks,
      timings,
    };
  }

  buildCacheKey(dto: AnalyzeJobDto): string {
    const jobTextHash = dto.jobText?.trim() ? createHash('sha256').update(normalizeJobText(dto.jobText.trim())).digest('hex') : 'scrape';
    const profileKey = JSON.stringify(effectiveUserProfile(dto.userProfile) ?? null);
    const payload: string = [ANALYSIS_PROMPT_CACHE_VERSION, dto.jobUrl, jobTextHash, profileKey].join(':');
    return createHash('sha256').update(payload).digest('hex');
  }

  private createAccessToken(jobId: string): string {
    const secret = this.configService.getOrThrow<string>('JOB_ACCESS_SECRET');
    return signJobAccessToken(jobId, secret);
  }

  private formatPipelineError(err: unknown): {
    code?: 'SCRAPE_BLOCKED' | 'SCRAPE_FAILED';
    message: string;
  } {
    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof HttpException) {
      const payload = err.getResponse();
      const nested = this.getErrorPayload(payload);
      if (nested?.error === 'SCRAPE_BLOCKED') {
        return { code: 'SCRAPE_BLOCKED', message: nested.message ?? message };
      }
      if (nested?.error === 'SCRAPE_FAILED') {
        return { code: 'SCRAPE_FAILED', message: nested.message ?? message };
      }
    }

    return { message: message || 'Unknown error during analysis' };
  }

  private getErrorPayload(payload: unknown): { error?: string; message?: string } | null {
    if (!payload || typeof payload !== 'object') return null;
    return payload as { error?: string; message?: string };
  }
}
