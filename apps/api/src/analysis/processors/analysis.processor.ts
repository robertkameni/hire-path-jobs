/** biome-ignore-all lint/style/useImportType: Needed for NestJS DI (emitDecoratorMetadata) at runtime. */
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { JobsService } from '../jobs/jobs.service.js';
import { ANALYSIS_QUEUE_NAME, type AnalysisQueueJobPayload } from '../queue/analysis-queue.constants.js';
import { AnalysisPipelineService } from '../services/analysis-pipeline.service.js';

@Processor(ANALYSIS_QUEUE_NAME, { concurrency: 2 })
@Injectable()
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly analysisPipelineService: AnalysisPipelineService,
    private readonly jobsService: JobsService,
  ) {
    super();
  }

  async process(job: Job<AnalysisQueueJobPayload>): Promise<void> {
    const { jobId, dto, cacheKey } = job.data;
    this.logger.log(`Processing analysis job ${jobId}`);
    await this.jobsService.setProcessing(jobId);
    await this.analysisPipelineService.runPipeline({ jobId, dto, cacheKey });
  }
}
