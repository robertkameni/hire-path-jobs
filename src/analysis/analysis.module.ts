import { Module } from '@nestjs/common';
import { AnalysisController } from './controllers/analysis.controller';
import { AnalysisService } from './analysis.service';
import { JobsService } from './jobs/jobs.service';
import { AiModule } from '../ai/ai.module';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [AiModule, ScraperModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, JobsService],
})
export class AnalysisModule {}
