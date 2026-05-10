import { performance } from 'node:perf_hooks';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { z } from 'zod';
import { AI_Port, type AiPort } from '../../ai/shared/ai.port.js';
import { StructuredLogger } from '../../common/logger/structured.logger.js';
import { jobParseAndTruthPrompt } from '../prompts/job-parse-and-truth.prompt.js';
import { strategyAndMessagePrompt } from '../prompts/strategy-and-message.prompt.js';
import { strategyAndMessageZeroProfilePrompt } from '../prompts/strategy-and-message-zero-profile.prompt.js';
import {
  type ContactStrategySchema,
  type JobInsightsSchema,
  type OutreachMessage,
  type ParsedJob,
  ParsedJobAndInsightsSchema,
  StrategyAndMessageSchema,
  StrategyAndMessageZeroProfileSchema,
} from '../schemas/analysis.schemas.js';
import { buildFallbackMessage, buildParseFailureResult } from '../utils/analysis-fallbacks.js';
import { effectiveUserProfile } from '../utils/effective-user-profile.js';
import { buildRecruiterValidationSubject } from '../utils/recruiter-validation-subject.js';

type JobInsights = z.infer<typeof JobInsightsSchema>;
type ContactStrategy = z.infer<typeof ContactStrategySchema>;

type Fallback = { step: string; reason?: string };

@Injectable()
export class AnalysisService {
  private logger = new StructuredLogger(AnalysisService.name);

  constructor(@Inject(AI_Port) private readonly aiPort: AiPort) {}

  async analyze(input: { jobText: string; userProfile?: unknown; jobId?: string }) {
    const { jobId } = input;
    const userProfile = effectiveUserProfile(input.userProfile);
    this.logger.event('pipeline_start', { jobId });
    const timings: Record<string, number> = {};
    const fallbacks: Fallback[] = [];

    const parseResult = await this.runStep('parseJobAndTruth', () => this.parseJobAndTruth(input.jobText));

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

    const strategyAndMessageResult = await this.runStep('strategyAndMessage', () => this.generateStrategyAndMessage(job, insights, userProfile));

    timings.strategyAndMessage = strategyAndMessageResult.durationMs;

    let strategy: ContactStrategy | null = null;
    let message: OutreachMessage;

    if (strategyAndMessageResult.fallback) {
      fallbacks.push({
        step: 'strategyAndMessage',
        reason: strategyAndMessageResult.error ?? 'Strategy+message step failed',
      });
      message = buildFallbackMessage(job, userProfile !== undefined);
    } else {
      strategy = strategyAndMessageResult.data.strategy;
      message = strategyAndMessageResult.data.message;
      if (userProfile === undefined) {
        message = {
          ...message,
          subject: buildRecruiterValidationSubject(job),
        };
      }
    }

    this.logger.event('pipeline_complete', {
      jobId,
      status: fallbacks.length === 0 ? 'complete' : 'partial',
      fallbackSteps: fallbacks.map((f) => f.step),
      ...Object.fromEntries(Object.entries(timings).map(([k, v]) => [`${k}Ms`, v])),
    });

    return {
      job,
      insights,
      strategy,
      message,
      status: fallbacks.length === 0 ? 'complete' : 'partial',
      fallbacks,
      timings,
    };
  }

  private async runStep<T>(name: string, fn: () => Promise<T>) {
    const start = performance.now();
    try {
      const data = await fn();
      const durationMs = Math.round(performance.now() - start);
      this.logger.event('step_complete', {
        step: name,
        durationMs,
        status: 'success',
      });
      return { data, fallback: false, durationMs };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const error = err instanceof Error ? err.message : String(err);
      this.logger.errorEvent('step_failed', { step: name, durationMs, error });
      return { data: null, fallback: true, durationMs, error };
    }
  }

  private parseAiResponse<T>(raw: string, schema: z.ZodType<T>, step: string): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new InternalServerErrorException(`AI returned invalid JSON at step: ${step}`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      this.logger.errorEvent('schema_validation_failed', {
        step,
        errors: result.error.flatten(),
      });
      throw new InternalServerErrorException(`AI response did not match expected schema at step: ${step}`);
    }
    return result.data;
  }

  private async parseJobAndTruth(jobText: string) {
    const raw = await this.aiPort.generateText(jobParseAndTruthPrompt(jobText), {
      temperature: 0,
    });
    return this.parseAiResponse(raw, ParsedJobAndInsightsSchema, 'parseJobAndTruth');
  }

  private async generateStrategyAndMessage(job: ParsedJob, insights: JobInsights, userProfile: unknown) {
    const hasProfile = userProfile !== undefined;
    const raw = await this.aiPort.generateText(
      hasProfile ? strategyAndMessagePrompt(job, insights, userProfile) : strategyAndMessageZeroProfilePrompt(job, insights),
      { temperature: hasProfile ? 0.15 : 0 },
    );
    return this.parseAiResponse(raw, hasProfile ? StrategyAndMessageSchema : StrategyAndMessageZeroProfileSchema, 'generateStrategyAndMessage');
  }
}
