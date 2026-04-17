import { Injectable } from '@nestjs/common';
import type { JobTextExtractorService } from './job-text-extractor.service';
import type { ScraperHttpService } from './scraper-http.service';

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
