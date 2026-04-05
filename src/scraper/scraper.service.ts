import {
  Injectable,
  Logger,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Tags that never contain job description content
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
  private readonly logger = new Logger(ScraperService.name);

  async fetchJobText(url: string): Promise<string> {
    this.logger.log(`Fetching job posting from: ${url}`);

    this.validateUrl(url);

    let html: string;

    try {
      const response = await axios.get<string>(url, {
        headers: {
          // Mimic a real browser to avoid basic bot detection
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10_000,
        maxRedirects: 5,
        responseType: 'text',
      });

      html = response.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(`Could not fetch the job URL: ${message}`);
    }

    const text = this.extractText(html);

    if (text.length < 100) {
      throw new BadGatewayException(
        'The page at the provided URL does not appear to contain a job description. ' +
          'It may be JavaScript-rendered (e.g. LinkedIn) or behind a login wall.',
      );
    }

    this.logger.log(`Extracted ${text.length} characters from job page`);
    return text;
  }

  private extractText(html: string): string {
    const $ = cheerio.load(html);

    // Remove all noise elements in one pass
    $(NOISE_TAGS.join(',')).remove();

    // Prefer known job content containers if present
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
        if (text.length >= 100) return text;
      }
    }

    // Fall back to full body text
    return this.normalizeText($('body').text());
  }

  private normalizeText(raw: string): string {
    return raw
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException(`Invalid URL: ${url}`);
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Only http and https URLs are allowed.');
    }

    // Block requests to private/internal IP ranges (SSRF protection)
    const host = parsed.hostname.toLowerCase();
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (blockedHosts.includes(host)) {
      throw new BadRequestException(
        'Requests to local addresses are not allowed.',
      );
    }
    // Block private CIDR ranges by hostname pattern
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)) {
      throw new BadRequestException(
        'Requests to private network addresses are not allowed.',
      );
    }
  }
}
