import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobTextExtractorService } from './service/job-text-extractor.service.js';
import { ScraperService } from './service/scraper.service.js';
import { ScraperHttpService } from './service/scraper-http.service.js';

@Module({
  imports: [ConfigModule],
  providers: [ScraperHttpService, JobTextExtractorService, ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
