import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { jobParsePrompt } from '../ai/prompts/job-parse.prompt';
import { jobTruthPrompt } from '../ai/prompts/job-truth.prompt';
import { contactStrategyPrompt } from '../ai/prompts/contact-strategy.prompt';
import { messagePrompt } from '../ai/prompts/message.prompt';
import type {
  ParsedJob,
  JobInsights,
  ContactStrategy,
  OutreachMessage,
  AnalysisResult,
} from './interfaces/analysis.types';

interface PipelineInput {
  jobText: string;
  userProfile?: {
    role?: string;
    skills?: string[];
  };
}

@Injectable()
export class AnalysisPipeline {
  private readonly logger = new Logger(AnalysisPipeline.name);

  constructor(private readonly aiService: AiService) {}

  async runAnalysis(input: PipelineInput): Promise<AnalysisResult> {
    this.logger.log('Starting analysis pipeline');

    // Step 1: Parse the job description into structured data
    const job = await this.parseJob(input.jobText);

    // Step 2: Analyze job quality and flag risks
    const insights = await this.analyzeJobTruth(job, input.jobText);

    // Step 3: Generate a contact strategy
    const strategy = await this.generateContactStrategy(
      job,
      insights,
      input.userProfile,
    );

    // Step 4: Generate the outreach message
    const message = await this.generateMessage(
      job,
      strategy,
      input.userProfile,
    );

    this.logger.log('Pipeline completed successfully');

    return { job, insights, strategy, message };
  }

  private async parseJob(jobText: string): Promise<ParsedJob> {
    this.logger.log('Step 1: Parsing job description');
    const prompt = jobParsePrompt(jobText);
    const raw = await this.aiService.generate(prompt);
    return JSON.parse(raw) as ParsedJob;
  }

  private async analyzeJobTruth(
    job: ParsedJob,
    jobText: string,
  ): Promise<JobInsights> {
    this.logger.log('Step 2: Analyzing job quality');
    const prompt = jobTruthPrompt(job, jobText);
    const raw = await this.aiService.generate(prompt);
    return JSON.parse(raw) as JobInsights;
  }

  private async generateContactStrategy(
    job: ParsedJob,
    insights: JobInsights,
    userProfile?: PipelineInput['userProfile'],
  ): Promise<ContactStrategy> {
    this.logger.log('Step 3: Generating contact strategy');
    const prompt = contactStrategyPrompt(job, insights, userProfile);
    const raw = await this.aiService.generate(prompt);
    return JSON.parse(raw) as ContactStrategy;
  }

  private async generateMessage(
    job: ParsedJob,
    strategy: ContactStrategy,
    userProfile?: PipelineInput['userProfile'],
  ): Promise<OutreachMessage> {
    this.logger.log('Step 4: Generating outreach message');
    const prompt = messagePrompt(job, strategy, userProfile);
    const raw = await this.aiService.generate(prompt);
    return JSON.parse(raw) as OutreachMessage;
  }
}
