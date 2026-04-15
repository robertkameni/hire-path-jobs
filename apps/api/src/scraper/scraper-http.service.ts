import {
  Injectable,
  Logger,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';
import axios from 'axios';
import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';

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

function buildSsrfBlockList(): net.BlockList {
  const list = new net.BlockList();
  list.addSubnet('0.0.0.0', 8);
  list.addSubnet('10.0.0.0', 8);
  list.addSubnet('127.0.0.0', 8);
  list.addSubnet('169.254.0.0', 16);
  list.addSubnet('172.16.0.0', 12);
  list.addSubnet('192.168.0.0', 16);
  list.addSubnet('100.64.0.0', 10);
  list.addSubnet('192.0.0.0', 24);
  list.addSubnet('192.0.2.0', 24);
  list.addSubnet('198.18.0.0', 15);
  list.addSubnet('198.51.100.0', 24);
  list.addSubnet('203.0.113.0', 24);
  list.addSubnet('224.0.0.0', 4);
  list.addSubnet('240.0.0.0', 4);
  list.addSubnet('::', 128, 'ipv6');
  list.addSubnet('::1', 128, 'ipv6');
  list.addSubnet('fe80::', 10, 'ipv6');
  list.addSubnet('fc00::', 7, 'ipv6');
  list.addSubnet('ff00::', 8, 'ipv6');
  return list;
}

const SSRF_BLOCKLIST = buildSsrfBlockList();

function executeSsrfSafeLookup(
  hostname: string,
  _options: object,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number,
  ) => void,
): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }
    if (!addresses || addresses.length === 0) {
      callback(
        Object.assign(new Error('No addresses'), { code: 'ENOTFOUND' }),
        '',
        0,
      );
      return;
    }
    for (const entry of addresses) {
      if (SSRF_BLOCKLIST.check(entry.address)) {
        callback(
          Object.assign(new Error('Forbidden target address'), {
            code: 'EHOSTUNREACH',
          }),
          '',
          0,
        );
        return;
      }
    }
    const first = addresses[0];
    callback(null, first.address, first.family);
  });
}

const SCRAPER_HTTP_AGENT = new http.Agent({
  lookup: executeSsrfSafeLookup,
});
const SCRAPER_HTTPS_AGENT = new https.Agent({
  lookup: executeSsrfSafeLookup,
});

@Injectable()
export class ScraperHttpService {
  private logger = new Logger(ScraperHttpService.name);

  async fetchHtml(url: string): Promise<string> {
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
        httpAgent: SCRAPER_HTTP_AGENT,
        httpsAgent: SCRAPER_HTTPS_AGENT,
        beforeRedirect: (redirectConfig) => {
          if (redirectConfig.url) {
            this.validateUrl(redirectConfig.url);
          }
        },
      });
      return response.data;
    } catch (err: any) {
      const nested = err?.cause ?? err;
      const nestedMsg =
        nested instanceof Error ? nested.message : String(nested);
      const topMsg = err instanceof Error ? err.message : String(err);
      if (
        nestedMsg === 'Forbidden target address' ||
        topMsg.includes('Forbidden target address')
      ) {
        throw new BadRequestException(
          'Requests to that address are not allowed.',
        );
      }
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
