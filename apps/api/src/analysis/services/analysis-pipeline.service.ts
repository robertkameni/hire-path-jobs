import { createHash } from 'node:crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { StructuredLogger } from '../../common/logger/structured.logger';
import { normalizeJobText } from '../../scraper/job-normalizer';
import type { ScraperService } from '../../scraper/scraper.service';
import type { AnalyzeJobDto } from '../dto/analyze-job.dto';
import type { JobResponseDto } from '../dto/job-response.dto';
import type { JobRecord } from '../jobs/job-record.types';
import type { JobsService } from '../jobs/jobs.service';
import { mapJobRecordToJobResponseDto } from '../mappers/job-response.mapper';
import type { AnalysisService } from './analysis.service';

const MAX_QUEUE_DEPTH = 50;
// Token/cost guardrails for gemini-2.5-flash (char-based approximation).
const MAX_AI_JOB_TEXT_CHARS = 35000;
const AI_JOB_TEXT_HEAD_CHARS = 25000;
const AI_JOB_TEXT_TAIL_CHARS = 10000;

function truncateForAi(text: string): string {
  if (text.length <= MAX_AI_JOB_TEXT_CHARS) return text;

  const head = text.slice(0, AI_JOB_TEXT_HEAD_CHARS).trimEnd();
  const tail = text.slice(-AI_JOB_TEXT_TAIL_CHARS).trimStart();

  return `${head}\n\n[... truncated ...]\n\n${tail}`;
}

type AnalysisPipelineInput = {
  readonly jobId: string;
  readonly dto: AnalyzeJobDto;
  readonly cacheKey: string;
};

type AnalyzeResult = {
  readonly status?: string;
};

@Injectable()
export class AnalysisPipelineService {
  private logger = new StructuredLogger(AnalysisPipelineService.name);
  private readonly inFlightJobIdByCacheKey = new Map<string, string>();

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly scraperService: ScraperService,
    private readonly jobsService: JobsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getJob(id: string): Promise<JobResponseDto> {
    const job: JobRecord = await this.jobsService.get(id);
    return mapJobRecordToJobResponseDto(job);
  }

  async submit(dto: AnalyzeJobDto): Promise<JobResponseDto> {
    const pending: number = await this.jobsService.countPending();
    if (pending >= MAX_QUEUE_DEPTH) {
      throw new HttpException(
        'Queue at capacity — try again shortly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const cacheKey: string = this.buildCacheKey(dto);
    const cached: unknown = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.event('cache_hit', { cacheKey: cacheKey.slice(0, 16) });
      const jobFromCache: JobRecord =
        await this.jobsService.createCompleted(cached);
      return mapJobRecordToJobResponseDto(jobFromCache);
    }
    const existingJobId: string | undefined =
      this.inFlightJobIdByCacheKey.get(cacheKey);
    if (existingJobId) {
      const existingJob: JobRecord = await this.jobsService.get(existingJobId);
      return mapJobRecordToJobResponseDto(existingJob);
    }
    const job: JobRecord = await this.jobsService.create();
    this.inFlightJobIdByCacheKey.set(cacheKey, job.id);
    await this.jobsService.setProcessing(job.id);
    this.logger.event('pipeline_start', { jobId: job.id });
    void this.runPipeline({ jobId: job.id, dto, cacheKey })
      .catch(async (err: unknown) => {
        const formatted = this.formatPipelineError(err);
        this.logger.event('pipeline_unhandled', {
          jobId: job.id,
          message: formatted.message,
          errorCode: formatted.code,
        });
        await this.jobsService.setFailed(
          job.id,
          formatted.message,
          formatted.code,
        );
      })
      .finally(() => {
        this.inFlightJobIdByCacheKey.delete(cacheKey);
      });
    const latestJob: JobRecord = await this.jobsService.get(job.id);
    return mapJobRecordToJobResponseDto(latestJob);
  }

  private async runPipeline(input: AnalysisPipelineInput): Promise<void> {
    const { jobId, dto, cacheKey } = input;
    try {
      const providedJobText = dto.jobText?.trim();
      const scrapedJobText = providedJobText
        ? null
        : await this.scraperService.fetchJobText(dto.jobUrl);

      const normalizedJobText = normalizeJobText(
        providedJobText ?? scrapedJobText ?? '',
      );
      const jobText = truncateForAi(normalizedJobText);

      const result: AnalyzeResult = (await this.analysisService.analyze({
        jobText,
        userProfile: dto.userProfile,
        jobId,
      })) as AnalyzeResult;

      await this.cacheManager.set(cacheKey, result);

      if (result.status === 'partial') {
        await this.jobsService.setPartial(jobId, result);
        return;
      }

      await this.jobsService.setCompleted(jobId, result);
    } catch (err: unknown) {
      const formatted = this.formatPipelineError(err);
      await this.jobsService.setFailed(
        jobId,
        formatted.message,
        formatted.code,
      );
    }
  }

  private buildCacheKey(dto: AnalyzeJobDto): string {
    const jobTextHash = dto.jobText?.trim()
      ? createHash('sha256')
          .update(normalizeJobText(dto.jobText.trim()))
          .digest('hex')
      : 'scrape';
    const payload: string =
      dto.jobUrl + jobTextHash + JSON.stringify(dto.userProfile ?? null);
    return createHash('sha256').update(payload).digest('hex');
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

  private getErrorPayload(
    payload: unknown,
  ): { error?: string; message?: string } | null {
    if (!payload || typeof payload !== 'object') return null;
    return payload as { error?: string; message?: string };
  }
}
