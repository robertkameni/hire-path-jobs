import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { AiModule } from '../ai/ai.module.js';
import { useUpstashRedis } from '../common/config/upstash-enabled.js';
import { ScraperModule } from '../scraper/scraper.module.js';
import { AnalysisController } from './controllers/analysis.controller.js';
import { InMemoryJobStore } from './jobs/in-memory-job.store.js';
import type { JobStore } from './jobs/job-store.interface.js';
import { JOB_STORE } from './jobs/job-store.token.js';
import { JobsService } from './jobs/jobs.service.js';
import { RedisJobStore } from './jobs/redis-job.store.js';
import { AnalysisService } from './services/analysis.service.js';
import { AnalysisPipelineService } from './services/analysis-pipeline.service.js';
@Module({
  imports: [AiModule, ScraperModule],
  controllers: [AnalysisController],
  providers: [
    {
      provide: JOB_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JobStore => {
        if (useUpstashRedis(config)) {
          const url = config.get<string>('UPSTASH_REDIS_REST_URL')?.trim();
          const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN')?.trim();
          if (!url || !token) {
            return new InMemoryJobStore();
          }
          return new RedisJobStore(new Redis({ url, token }));
        }
        return new InMemoryJobStore();
      },
    },
    AnalysisService,
    AnalysisPipelineService,
    JobsService,
  ],
})
export class AnalysisModule {}
