import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobTextExtractorService } from './job-text-extractor.service.js';
import { ScraperService } from './scraper.service.js';
import { ScraperHttpService } from './scraper-http.service.js';

@Module({
  imports: [ConfigModule],
  providers: [ScraperHttpService, JobTextExtractorService, ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
