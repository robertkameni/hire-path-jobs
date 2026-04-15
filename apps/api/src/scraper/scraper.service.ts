import { Injectable } from '@nestjs/common';
import { ScraperHttpService } from './scraper-http.service';
import { JobTextExtractorService } from './job-text-extractor.service';

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
