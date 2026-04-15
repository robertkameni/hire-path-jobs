import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScraperService } from './scraper.service';
import { ScraperHttpService } from './scraper-http.service';
import { JobTextExtractorService } from './job-text-extractor.service';

@Module({
  imports: [ConfigModule],
  providers: [ScraperHttpService, JobTextExtractorService, ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}