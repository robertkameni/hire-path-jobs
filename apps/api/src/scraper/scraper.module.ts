import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobTextExtractorService } from './job-text-extractor.service';
import { ScraperService } from './scraper.service';
import { ScraperHttpService } from './scraper-http.service';

@Module({
  imports: [ConfigModule],
  providers: [ScraperHttpService, JobTextExtractorService, ScraperService],
  exports: [ScraperService],
})
export class ScraperModule {}
