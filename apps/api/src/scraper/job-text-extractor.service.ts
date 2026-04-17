import { Readability } from '@mozilla/readability';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Needed for NestJS DI (emitDecoratorMetadata) to resolve ConfigService at runtime.
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';

const NOISE_TAGS = [
  'script',
  'style',
  'noscript',
  'header',
  'footer',
  'nav',
  'aside',
  'iframe',
  'form',
  'button',
  'img',
  'svg',
  'meta',
  'link',
];

@Injectable()
export class JobTextExtractorService {
  private logger = new Logger(JobTextExtractorService.name);
  private minTextLength: number;
  private maxTextChars: number;

  constructor(private configService: ConfigService) {
    this.minTextLength = this.configService.get<number>(
      'SCRAPER_MIN_TEXT_LENGTH',
      100,
    );
    this.maxTextChars = this.configService.get<number>(
      'SCRAPER_MAX_TEXT_CHARS',
      12000,
    );
  }

  extractJobText(html: string, pageUrl: string): string {
    let text = this.extractWithCheerio(html);
    if (text.length < this.minTextLength) {
      this.logger.warn(
        `Cheerio extracted only ${text.length} chars — trying Readability fallback`,
      );
      text = this.extractWithReadability(html, pageUrl);
    }
    if (text.length < this.minTextLength) {
      throw new BadGatewayException({
        error: 'SCRAPE_FAILED',
        message:
          'The page at the provided URL does not appear to contain a job description. ' +
          'It may be JavaScript-rendered (e.g. LinkedIn) or behind a login wall.',
      });
    }
    if (text.length > this.maxTextChars) {
      this.logger.warn(
        `Job text truncated from ${text.length} to ${this.maxTextChars} chars`,
      );
      text = text.slice(0, this.maxTextChars);
    }
    this.logger.log(`Extracted ${text.length} characters from job page`);
    return text;
  }

  private extractWithCheerio(html: string) {
    const $ = cheerio.load(html);
    $(NOISE_TAGS.join(',')).remove();
    const selectors = [
      '[class*="job-description"]',
      '[class*="jobDescription"]',
      '[id*="job-description"]',
      '[id*="jobDescription"]',
      '[class*="job-details"]',
      '[class*="jobDetails"]',
      'article',
      'main',
    ];
    for (const selector of selectors) {
      const el = $(selector).first();
      if (el.length) {
        const text = this.normalizeText(el.text());
        if (text.length >= this.minTextLength) return text;
      }
    }
    return this.normalizeText($('body').text());
  }

  private extractWithReadability(html: string, url: string) {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(
        dom.window.document as unknown as Document,
      );
      const article = reader.parse();
      if (article?.textContent) return this.normalizeText(article.textContent);
    } catch (err: unknown) {
      this.logger.warn(
        `Readability fallback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return '';
  }

  private normalizeText(raw: string) {
    return raw
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
