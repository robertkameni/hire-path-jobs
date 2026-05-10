import { performance } from 'node:perf_hooks';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { z } from 'zod';
import { AI_Port, type AiPort } from '../../ai/shared/ai.port.js';
import { StructuredLogger } from '../../common/logger/structured.logger.js';
import { jobParseAndTruthPrompt } from '../prompts/job-parse-and-truth.prompt.js';
import { strategyAndMessagePrompt } from '../prompts/strategy-and-message.prompt.js';
import {
  type ContactStrategySchema,
  type JobInsightsSchema,
  type OutreachMessageSchema,
  ParsedJobAndInsightsSchema,
  type ParsedJobSchema,
  StrategyAndMessageSchema,
} from '../schemas/analysis.schemas.js';
import { effectiveUserProfile } from '../utils/effective-user-profile.js';

type ParsedJob = z.infer<typeof ParsedJobSchema>;
type JobInsights = z.infer<typeof JobInsightsSchema>;
type ContactStrategy = z.infer<typeof ContactStrategySchema>;
type OutreachMessage = z.infer<typeof OutreachMessageSchema>;

type Fallback = { step: string; reason?: string };

function buildParseFailureResult(reason: string | undefined, durationMs: number) {
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

function buildFallbackMessage(job: ParsedJob, hasTrustedProfile: boolean): OutreachMessage {
  if (!hasTrustedProfile) {
    return {
      subject: `Frage zur Rolle ${job.title} bei ${job.company}`,
      body: `Hallo,\n\nich schaue mir die Stelle „${job.title}“ bei ${job.company} an. Bevor ich mich bewerbe, hätte ich eine kurze Rückfrage zum aktuellen Schwerpunkt der Rolle im Team.\n\nViele Grüße`,
      tone: 'friendly',
    };
  }
  const skillLine =
    job.skills.length > 0 ? ` Mein Hintergrund in ${job.skills.slice(0, 2).join(' und ')} passt direkt zu den Anforderungen dieser Stelle.` : '';
  return {
    subject: `${job.title} — ${job.company}`,
    body: `Hallo, ich bin auf die Stelle als ${job.title} bei ${job.company} aufmerksam geworden und möchte mich vor einer formellen Bewerbung direkt melden.${skillLine} Sind Sie die richtige Ansprechperson für diese Position, oder können Sie mich an jemanden weiterleiten?`,
    tone: 'direct',
  };
}

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
    const raw = await this.aiPort.generateText(strategyAndMessagePrompt(job, insights, userProfile), { temperature: 0.15 });
    return this.parseAiResponse(raw, StrategyAndMessageSchema, 'generateStrategyAndMessage');
  }
}
