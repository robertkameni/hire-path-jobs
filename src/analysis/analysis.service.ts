import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { jobParseAndTruthPrompt } from './prompts/job-parse-and-truth.prompt';
import { contactStrategyPrompt } from './prompts/contact-strategy.prompt';
import { messagePrompt } from './prompts/message.prompt';
import type {
  AnalyzeJobInput,
  ParsedJob,
  JobInsights,
  ContactStrategy,
  OutreachMessage,
  AnalysisResult,
  UserProfile,
} from './interfaces/analysis.types';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(private readonly aiService: AiService) {}

  async analyze(input: AnalyzeJobInput): Promise<AnalysisResult> {
    this.logger.log('Starting analysis pipeline');

    // Step 1: Parse job + analyze quality in a single LLM call.
    const { job, insights } = await this.parseJobAndTruth(input.jobText);

    // Step 2: Contact strategy needs job + insights.
    const strategy = await this.generateContactStrategy(
      job,
      insights,
      input.userProfile,
    );

    // Step 3: Outreach message needs job + strategy.
    const message = await this.generateMessage(
      job,
      strategy,
      input.userProfile,
    );

    this.logger.log('Analysis pipeline completed');
    return { job, insights, strategy, message };
  }

  private parseAiResponse<T>(raw: string, step: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new InternalServerErrorException(
        `AI returned invalid JSON at step: ${step}`,
      );
    }
  }

  private async parseJobAndTruth(
    jobText: string,
  ): Promise<{ job: ParsedJob; insights: JobInsights }> {
    this.logger.log('Step 1: Parsing job and analyzing quality');
    const raw = await this.aiService.generate(jobParseAndTruthPrompt(jobText), {
      temperature: 0,
    });
    return this.parseAiResponse<{ job: ParsedJob; insights: JobInsights }>(
      raw,
      'parseJobAndTruth',
    );
  }

  private async generateContactStrategy(
    job: ParsedJob,
    insights: JobInsights,
    userProfile?: UserProfile,
  ): Promise<ContactStrategy> {
    this.logger.log('Step 2: Generating contact strategy');
    const raw = await this.aiService.generate(
      contactStrategyPrompt(job, insights, userProfile),
      { temperature: 0.2 },
    );
    return this.parseAiResponse<ContactStrategy>(
      raw,
      'generateContactStrategy',
    );
  }

  private async generateMessage(
    job: ParsedJob,
    strategy: ContactStrategy,
    userProfile?: UserProfile,
  ): Promise<OutreachMessage> {
    this.logger.log('Step 3: Generating outreach message');
    const raw = await this.aiService.generate(
      messagePrompt(job, strategy, userProfile),
      { temperature: 0.4 },
    );
    return this.parseAiResponse<OutreachMessage>(raw, 'generateMessage');
  }
}
