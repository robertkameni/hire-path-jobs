import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { AiModule } from '../ai/ai.module';
import { ScraperModule } from '../scraper/scraper.module';
import { AnalysisController } from './controllers/analysis.controller';
import { InMemoryJobStore } from './jobs/in-memory-job.store';
import type { JobStore } from './jobs/job-store.interface';
import { JOB_STORE } from './jobs/job-store.token';
import { JobsService } from './jobs/jobs.service';
import { RedisJobStore } from './jobs/redis-job.store';
import { AnalysisService } from './services/analysis.service';
import { AnalysisPipelineService } from './services/analysis-pipeline.service';

@Module({
  imports: [AiModule, ScraperModule],
  controllers: [AnalysisController],
  providers: [
    {
      provide: JOB_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JobStore => {
        const url = config.get<string>('UPSTASH_REDIS_REST_URL');
        const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN');
        if (url && token) {
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
