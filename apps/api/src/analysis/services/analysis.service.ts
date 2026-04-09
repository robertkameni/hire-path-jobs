import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import {
  ParsedJobAndInsightsSchema,
  StrategyAndMessageSchema,
} from '../schemas/analysis.schemas';
import { jobParseAndTruthPrompt } from '../prompts/job-parse-and-truth.prompt';
import { strategyAndMessagePrompt } from '../prompts/strategy-and-message.prompt';
import { StructuredLogger } from '../../common/logger/structured.logger';
import { performance } from 'perf_hooks';

function buildParseFailureResult(
  reason: string | undefined,
  durationMs: number,
) {
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

function buildFallbackMessage(job: any) {
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
  private logger = new StructuredLogger(AnalysisService.name);

  constructor(private aiService: AiService) {}

  async analyze(input: { jobText: string; userProfile?: any; jobId?: string }) {
    const { jobId } = input;
    this.logger.event('pipeline_start', { jobId });
    const timings: Record<string, number> = {};
    const fallbacks: Array<any> = [];

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

    const strategyAndMessageResult = await this.runStep(
      'strategyAndMessage',
      () => this.generateStrategyAndMessage(job, insights, input.userProfile),
    );
    timings.strategyAndMessage = strategyAndMessageResult.durationMs;

    let strategy = null;
    let message;
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

  private async runStep(name: string, fn: () => Promise<any>) {
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
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      const error = err instanceof Error ? err.message : String(err);
      this.logger.errorEvent('step_failed', { step: name, durationMs, error });
      return { data: null, fallback: true, durationMs, error };
    }
  }

  private parseAiResponse(raw: string, schema: any, step: string) {
    let parsed;
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
        errors: JSON.parse(result.error.message),
      });
      throw new InternalServerErrorException(
        `AI response did not match expected schema at step: ${step}`,
      );
    }
    return result.data;
  }

  private async parseJobAndTruth(jobText: string) {
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
    job: any,
    insights: any,
    userProfile: any,
  ) {
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
