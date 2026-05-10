import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { AI_Port, type AiPort } from '../../ai/shared/ai.port.js';
import { StructuredLogger } from '../../common/logger/structured.logger.js';
import { strategyAndMessagePrompt } from '../prompts/strategy-and-message.prompt.js';
import { strategyAndMessageZeroProfilePrompt } from '../prompts/strategy-and-message-zero-profile.prompt.js';
import {
  type ContactStrategySchema,
  type JobInsightsSchema,
  type OutreachMessage,
  type ParsedJob,
  StrategyAndMessageSchema,
  StrategyAndMessageZeroProfileSchema,
} from '../schemas/analysis.schemas.js';
import { parseAiJsonResponse, runAiTimedStep } from '../utils/ai-structured-step.js';
import { buildFallbackMessage } from '../utils/analysis-fallbacks.js';
import { applyRecruiterValidationSubjectWhenAnonymous } from '../utils/recruiter-validation-subject.js';

type JobInsights = z.infer<typeof JobInsightsSchema>;
type ContactStrategy = z.infer<typeof ContactStrategySchema>;

export type StrategyAndMessageStepOutcome = {
  durationMs: number;
  strategy: ContactStrategy | null;
  message: OutreachMessage;
  strategyStepFallback: { reason: string } | null;
};

@Injectable()
export class StrategyAndMessageService {
  private logger = new StructuredLogger(StrategyAndMessageService.name);

  constructor(@Inject(AI_Port) private readonly aiPort: AiPort) {}

  async runWithFallbacks(
    job: ParsedJob,
    insights: JobInsights,
    userProfile: unknown,
    hasTrustedProfile: boolean,
  ): Promise<StrategyAndMessageStepOutcome> {
    const result = await runAiTimedStep(this.logger, 'strategyAndMessage', () =>
      this.generateStrategyAndMessage(job, insights, userProfile, hasTrustedProfile),
    );

    if (result.fallback) {
      return {
        durationMs: result.durationMs,
        strategy: null,
        message: buildFallbackMessage(job, hasTrustedProfile),
        strategyStepFallback: { reason: result.error ?? 'Strategy+message step failed' },
      };
    }

    return {
      durationMs: result.durationMs,
      strategy: result.data.strategy,
      message: applyRecruiterValidationSubjectWhenAnonymous(job, result.data.message, hasTrustedProfile),
      strategyStepFallback: null,
    };
  }

  private async generateStrategyAndMessage(job: ParsedJob, insights: JobInsights, userProfile: unknown, hasTrustedProfile: boolean) {
    const raw = await this.aiPort.generateText(
      hasTrustedProfile ? strategyAndMessagePrompt(job, insights, userProfile) : strategyAndMessageZeroProfilePrompt(job, insights),
      { temperature: hasTrustedProfile ? 0.15 : 0 },
    );
    return parseAiJsonResponse(
      this.logger,
      raw,
      hasTrustedProfile ? StrategyAndMessageSchema : StrategyAndMessageZeroProfileSchema,
      'generateStrategyAndMessage',
    );
  }
}
