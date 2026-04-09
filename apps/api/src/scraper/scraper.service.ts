import {
  Injectable,
  Logger,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { ConfigService } from '@nestjs/config';

const BLOCKED_DOMAINS = new Set([
  'linkedin.com',
  'www.linkedin.com',
  'indeed.com',
  'www.indeed.com',
  'de.indeed.com',
  'glassdoor.com',
  'www.glassdoor.com',
  'de.glassdoor.com',
  'xing.com',
  'www.xing.com',
  'monster.com',
  'www.monster.com',
  'stepstone.de',
  'www.stepstone.de',
  'jobs.google.com',
]);

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
export class ScraperService {
  private logger = new Logger(ScraperService.name);
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

  async fetchJobText(url: string): Promise<string> {
    this.logger.log(`Fetching job posting from: ${url}`);
    this.validateUrl(url);
    const host = new URL(url).hostname.toLowerCase();
    if (BLOCKED_DOMAINS.has(host)) {
      throw new BadGatewayException({
        error: 'SCRAPE_BLOCKED',
        message:
          'This site blocks automated access. We cannot fetch the job from this site automatically.',
      });
    }

    let html: string;
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000,
        maxRedirects: 5,
        responseType: 'text',
      });
      html = response.data;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err?.response?.status ?? 0;
      const isBlocked = [401, 403, 429, 503].includes(status);
      if (isBlocked) {
        throw new BadGatewayException({
          error: 'SCRAPE_BLOCKED',
          message:
            'This site blocks automated access. We cannot fetch the job from this site automatically.',
        });
      }
      throw new BadGatewayException({
        error: 'SCRAPE_FAILED',
        message: `Could not fetch the job URL: ${message}`,
      });
    }

    let text = this.extractWithCheerio(html);
    if (text.length < this.minTextLength) {
      this.logger.warn(
        `Cheerio extracted only ${text.length} chars — trying Readability fallback`,
      );
      text = this.extractWithReadability(html, url);
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
      const reader = new Readability(dom.window.document as any);
      const article = reader.parse();
      if (article?.textContent) return this.normalizeText(article.textContent);
    } catch (err: any) {
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

  private validateUrl(url: string) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Only http and https URLs are allowed.');
    }
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (blockedHosts.includes(host)) {
      throw new BadRequestException(
        'Requests to local addresses are not allowed.',
      );
    }
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) {
      throw new BadRequestException(
        'Requests to private network addresses are not allowed.',
      );
    }
  }
}
