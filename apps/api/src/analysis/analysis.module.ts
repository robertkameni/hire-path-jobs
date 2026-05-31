import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { AiModule } from '../ai/ai.module.js';
import { ScraperModule } from '../scraper/scraper.module.js';
import { AnalysisController } from './controllers/analysis.controller.js';
import { JobAccessGuard } from './guards/job-access.guard.js';
import { InMemoryJobStore } from './jobs/in-memory-job.store.js';
import type { JobStore } from './jobs/job-store.interface.js';
import { JOB_STORE } from './jobs/job-store.token.js';
import { JobsService } from './jobs/jobs.service.js';
import { RedisJobStore } from './jobs/redis-job.store.js';
import { ANALYSIS_QUEUE_NAME } from './queue/analysis-queue.constants.js';
import { AnalysisPipelineService } from './services/analysis-pipeline.service.js';
import { JobDescriptionAnalysisService } from './services/job-description-analysis.service.js';
import { StrategyAndMessageService } from './services/strategy-and-message.service.js';

const BASE_PROVIDERS = [
  {
    provide: JOB_STORE,
    inject: [ConfigService],
    useFactory: (config: ConfigService): JobStore => {
      const url = config.get<string>('UPSTASH_REDIS_REST_URL')?.trim();
      const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN')?.trim();
      const useUpstash = Boolean(url && token) && config.get<string>('DISABLE_UPSTASH') !== 'true';
      if (useUpstash && url && token) {
        return new RedisJobStore(new Redis({ url, token }));
      }
      return new InMemoryJobStore();
    },
  },
  JobDescriptionAnalysisService,
  StrategyAndMessageService,
  AnalysisPipelineService,
  JobsService,
  JobAccessGuard,
];

@Module({})
export class AnalysisModule {}

export function registerAnalysisModule(): DynamicModule {
  const redisUrl = process.env.UPSTASH_REDIS_URL?.trim();
  const queueImports = redisUrl
    ? [
        BullModule.registerQueue({
          name: ANALYSIS_QUEUE_NAME,
        }),
      ]
    : [];

  return {
    module: AnalysisModule,
    imports: [AiModule, ScraperModule, ...queueImports],
    controllers: [AnalysisController],
    providers: [...BASE_PROVIDERS],
    exports: [AnalysisPipelineService, JobsService],
  };
}
