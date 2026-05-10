import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { AI_Port, type AiPort } from '../../ai/shared/ai.port.js';
import { StructuredLogger } from '../../common/logger/structured.logger.js';
import { jobParseAndTruthPrompt } from '../prompts/job-parse-and-truth.prompt.js';
import { ParsedJobAndInsightsSchema } from '../schemas/analysis.schemas.js';
import { type AiTimedStepResult, parseAiJsonResponse, runAiTimedStep } from '../utils/ai-structured-step.js';

export type ParsedJobAndInsights = z.infer<typeof ParsedJobAndInsightsSchema>;

@Injectable()
export class JobDescriptionAnalysisService {
  private logger = new StructuredLogger(JobDescriptionAnalysisService.name);

  constructor(@Inject(AI_Port) private readonly aiPort: AiPort) {}

  parsePosting(jobText: string): Promise<AiTimedStepResult<ParsedJobAndInsights>> {
    return runAiTimedStep(this.logger, 'parseJobAndTruth', () => this.parseJobAndTruth(jobText));
  }

  private async parseJobAndTruth(jobText: string): Promise<ParsedJobAndInsights> {
    const raw = await this.aiPort.generateText(jobParseAndTruthPrompt(jobText), {
      temperature: 0,
    });
    return parseAiJsonResponse(this.logger, raw, ParsedJobAndInsightsSchema, 'parseJobAndTruth');
  }
}
