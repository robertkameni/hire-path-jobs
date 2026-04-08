import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { AiService } from '../../ai/ai.service';
import { jobParseAndTruthPrompt } from '../prompts/job-parse-and-truth.prompt';
import { strategyAndMessagePrompt } from '../prompts/strategy-and-message.prompt';
import {
  ParsedJobAndInsightsSchema,
  StrategyAndMessageSchema,
} from '../schemas/analysis.schemas';
import type {
  AnalyzeJobInput,
  ParsedJob,
  JobInsights,
  ContactStrategy,
  OutreachMessage,
  AnalysisResult,
  FallbackInfo,
  UserProfile,
} from '../interfaces/analysis.types';
import type { StepResult } from '../pipeline/pipeline-step.interface';
import { StructuredLogger } from '../../common/logger/structured.logger';

/** Returned when the parse step itself fails — all downstream steps become null. */
function buildParseFailureResult(
  reason: string,
  durationMs: number,
): AnalysisResult {
  return {
    job: null,
    insights: null,
    strategy: null,
    message: null,
    status: 'partial',
    fallbacks: [{ step: 'parseJobAndTruth', reason }],
    timings: { parseJobAndTruth: durationMs },
  };
}

/** Template fallback when the message AI call fails. */
function buildFallbackMessage(job: ParsedJob): OutreachMessage {
  const skillLine =
    job.skills.length > 0
      ? ` Mein Hintergrund in ${job.skills.slice(0, 2).join(' und ')} passt direkt zu den Anforderungen dieser Stelle.`
      : '';

  return {
    subject: `${job.title} — ${job.company}`,
    body: `Hallo, ich bin auf die Stelle als ${job.title} bei ${job.company} aufmerksam geworden und möchte mich vor einer formellen Bewerbung direkt melden.${skillLine} Sind Sie die richtige Ansprechperson für diese Position, oder können Sie mich an jemanden weiterleiten?`,
    tone: 'direct',
  };
}

@Injectable()
export class AnalysisService {
  private readonly logger = new StructuredLogger(AnalysisService.name);

  constructor(private readonly aiService: AiService) {}

  async analyze(input: AnalyzeJobInput): Promise<AnalysisResult> {
    const { jobId } = input;
    this.logger.event('pipeline_start', { jobId });
    const timings: Record<string, number> = {};
    const fallbacks: FallbackInfo[] = [];

    // ── Step 1: Parse job + analyze quality (hard failure — downstream steps need this) ─
    const parseResult = await this.runStep('parseJobAndTruth', () =>
      this.parseJobAndTruth(input.jobText),
    );

    if (!parseResult.fallback) {
      timings.parseJobAndTruth = parseResult.durationMs;
    } else {
      this.logger.errorEvent('pipeline_aborted', {
        jobId,
        step: 'parseJobAndTruth',
        reason: parseResult.error,
      });
      return buildParseFailureResult(
        parseResult.error ?? 'Parse step failed',
        parseResult.durationMs,
      );
    }

    const { job, insights } = parseResult.data;

    // ── Step 2: Contact strategy + outreach message (single AI call) ─────────────────
    const strategyAndMessageResult = await this.runStep(
      'strategyAndMessage',
      () => this.generateStrategyAndMessage(job, insights, input.userProfile),
    );

    timings.strategyAndMessage = strategyAndMessageResult.durationMs;

    let strategy: ContactStrategy | null = null;
    let message: OutreachMessage;

    if (strategyAndMessageResult.fallback) {
      fallbacks.push({
        step: 'strategyAndMessage',
        reason:
          strategyAndMessageResult.error ?? 'Strategy+message step failed',
      });
      message = buildFallbackMessage(job);
    } else {
      strategy = strategyAndMessageResult.data.strategy;
      message = strategyAndMessageResult.data.message;
    }

    this.logger.event('pipeline_complete', {
      jobId,
      status: fallbacks.length === 0 ? 'complete' : 'partial',
      fallbackSteps: fallbacks.map((f) => f.step),
      ...Object.fromEntries(
        Object.entries(timings).map(([k, v]) => [`${k}Ms`, v]),
      ),
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

  /**
   * Wraps a pipeline step:
   * - measures wall-clock duration
   * - returns fallback=true instead of throwing on error
   *
   * For step 1 (parseJobAndTruth) we still want to surface the failure
   * to the caller, so the caller checks fallback=true and short-circuits.
   */
  private async runStep<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<StepResult<T>> {
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
      return { data: null as unknown as T, fallback: true, durationMs, error };
    }
  }

  private parseAiResponse<T>(
    raw: string,
    schema: ZodSchema<T>,
    step: string,
  ): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new InternalServerErrorException(
        `AI returned invalid JSON at step: ${step}`,
      );
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      this.logger.errorEvent('schema_validation_failed', {
        step,
        errors: JSON.parse(result.error.message) as unknown,
      });
      throw new InternalServerErrorException(
        `AI response did not match expected schema at step: ${step}`,
      );
    }

    return result.data;
  }

  private async parseJobAndTruth(
    jobText: string,
  ): Promise<{ job: ParsedJob; insights: JobInsights }> {
    const raw = await this.aiService.generate(jobParseAndTruthPrompt(jobText), {
      temperature: 0,
    });
    return this.parseAiResponse(
      raw,
      ParsedJobAndInsightsSchema,
      'parseJobAndTruth',
    );
  }

  private async generateStrategyAndMessage(
    job: ParsedJob,
    insights: JobInsights,
    userProfile?: UserProfile,
  ): Promise<{ strategy: ContactStrategy; message: OutreachMessage }> {
    const raw = await this.aiService.generate(
      strategyAndMessagePrompt(job, insights, userProfile),
      { temperature: 0.3 },
    );
    return this.parseAiResponse(
      raw,
      StrategyAndMessageSchema,
      'generateStrategyAndMessage',
    );
  }
}
