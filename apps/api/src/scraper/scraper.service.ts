/** biome-ignore-all lint/style/useImportType: Needed for NestJS DI (emitDecoratorMetadata) to resolve JobTextExtractorService and ScraperHttpService at runtime. */
import { Injectable } from '@nestjs/common';
import { JobTextExtractorService } from './job-text-extractor.service';
import { ScraperHttpService } from './scraper-http.service';

@Injectable()
export class ScraperService {
  constructor(
    private readonly scraperHttpService: ScraperHttpService,
    private readonly jobTextExtractorService: JobTextExtractorService,
  ) {}

  async fetchJobText(url: string): Promise<string> {
    const html = await this.scraperHttpService.fetchHtml(url);
    return this.jobTextExtractorService.extractJobText(html, url);
  }
}
