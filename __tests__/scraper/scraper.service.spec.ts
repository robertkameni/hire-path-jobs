import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScraperService } from '../../src/scraper/scraper.service';
import axios from 'axios';

// jsdom is a pure-ESM dependency chain — mock it so Jest (CommonJS mode) can load
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation(() => ({ window: { document: {} } })),
}));

// Mock axios at module level
jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('ScraperService', () => {
  let service: ScraperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((_key: string, def: unknown) => def),
          },
        },
      ],
    }).compile();

    service = module.get<ScraperService>(ScraperService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── validateUrl ─────────────────────────────────────────────────────────────

  describe('validateUrl (via fetchJobText)', () => {
    it('throws BadRequestException for a non-URL string', async () => {
      await expect(service.fetchJobText('not-a-url')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for non-http/https protocols', async () => {
      await expect(
        service.fetchJobText('ftp://example.com/job'),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks localhost', async () => {
      await expect(
        service.fetchJobText('http://localhost/job'),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks 127.0.0.1', async () => {
      await expect(
        service.fetchJobText('http://127.0.0.1/job'),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks private 192.168.x.x range', async () => {
      await expect(
        service.fetchJobText('http://192.168.1.1/job'),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks private 10.x.x.x range', async () => {
      await expect(service.fetchJobText('http://10.0.0.1/job')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('blocks private 172.16.x.x range', async () => {
      await expect(
        service.fetchJobText('http://172.16.0.1/job'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── network errors ───────────────────────────────────────────────────────────

  describe('fetchJobText — network errors', () => {
    it('throws BadGatewayException when axios rejects', async () => {
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.fetchJobText('https://example.com/job'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  // ── html extraction ──────────────────────────────────────────────────────────

  describe('fetchJobText — html extraction', () => {
    it('extracts text from a job-description div', async () => {
      const jobContent = 'We are looking for a Senior Engineer. '.repeat(5);
      const html = `<html><body>
        <nav>Irrelevant nav links here</nav>
        <div class="job-description">${jobContent}</div>
        <footer>Footer content</footer>
      </body></html>`;

      mockedAxios.get = jest.fn().mockResolvedValue({ data: html });

      const result = await service.fetchJobText('https://example.com/job');
      expect(result).toContain('Senior Engineer');
      expect(result).not.toContain('Footer content');
    });

    it('falls back to body text when no known selector matches', async () => {
      const bodyText = 'Join our team as a Product Manager. '.repeat(5);
      const html = `<html><body><p>${bodyText}</p></body></html>`;

      mockedAxios.get = jest.fn().mockResolvedValue({ data: html });

      const result = await service.fetchJobText('https://example.com/job');
      expect(result).toContain('Product Manager');
    });

    it('throws BadGatewayException when extracted text is too short', async () => {
      const html = '<html><body><p>Short page.</p></body></html>';
      mockedAxios.get = jest.fn().mockResolvedValue({ data: html });

      await expect(
        service.fetchJobText('https://example.com/job'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('prefers article element over body fallback', async () => {
      const articleContent =
        'Full stack developer needed with React skills. '.repeat(4);
      const html = `<html><body>
        <script>var x = 1;</script>
        <p>Some unrelated page content goes here</p>
        <article>${articleContent}</article>
      </body></html>`;

      mockedAxios.get = jest.fn().mockResolvedValue({ data: html });

      const result = await service.fetchJobText('https://example.com/job');
      expect(result).toContain('Full stack developer');
    });

    it('strips script and style content', async () => {
      const jobContent =
        'Backend engineer with Node.js experience wanted. '.repeat(4);
      const html = `<html><body>
        <script>alert("should be removed")</script>
        <style>.foo { display: none }</style>
        <main>${jobContent}</main>
      </body></html>`;

      mockedAxios.get = jest.fn().mockResolvedValue({ data: html });

      const result = await service.fetchJobText('https://example.com/job');
      expect(result).not.toContain('alert');
      expect(result).not.toContain('display: none');
    });
  });
});
