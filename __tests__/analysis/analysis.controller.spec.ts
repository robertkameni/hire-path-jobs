/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AnalysisController } from '../../src/analysis/controllers/analysis.controller';
import { AnalysisService } from '../../src/analysis/analysis.service';
import { ScraperService } from '../../src/scraper/scraper.service';
import type { AnalysisResult } from '../../src/analysis/interfaces/analysis.types';
import type { AnalyzeJobDto } from '../../src/analysis/dto/analyze-job.dto';

// p-limit is pure ESM — replace with a pass-through for Jest (CommonJS mode)
jest.mock('p-limit', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue((fn: () => unknown) => fn()),
}));
// jsdom (pulled in transitively by ScraperService) is also pure ESM
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation(() => ({ window: { document: {} } })),
}));

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const MOCK_RESULT: AnalysisResult = {
  job: {
    title: 'Backend Engineer',
    company: 'Acme Corp',
    location: 'Berlin',
    salary: '€90k',
    skills: ['Node.js'],
    requirements: ['3+ years Node.js'],
    responsibilities: ['Build APIs'],
    remote: false,
  },
  insights: {
    competitionLevel: 'medium',
    competitionReason: 'Mid-level role with popular stack.',
    competitionConfidence: 70,
    signalsLoweringCompetition: ['Geo-locked'],
    signalsRaisingCompetition: ['Node.js', 'mid-level'],
    ghostRisk: 'low',
    ghostRiskReason: 'Salary disclosed, specific team mentioned.',
    ghostRiskConfidence: 78,
    salaryFairness: 'market',
    redFlags: [],
    positives: ['Salary disclosed'],
    verdict: { apply: true, reason: 'No major red flags.' },
  },
  strategy: {
    targetRole: 'Engineering Manager',
    contactChannels: ['LinkedIn InMail'],
    talkingPoints: ['Node.js expertise'],
    timing: 'Apply within 48 hours.',
  },
  message: {
    subject: 'Experienced Node.js engineer interested in your opening',
    body: 'Short message body.',
    tone: 'friendly',
  },
};

const MOCK_DTO: AnalyzeJobDto = {
  jobUrl: 'https://example.com/jobs/backend-engineer',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalysisController', () => {
  let controller: AnalysisController;
  let analysisService: jest.Mocked<AnalysisService>;
  let scraperService: jest.Mocked<ScraperService>;
  let cacheStore: Map<string, unknown>;

  beforeEach(async () => {
    cacheStore = new Map();

    analysisService = {
      analyze: jest.fn().mockResolvedValue(MOCK_RESULT),
    } as unknown as jest.Mocked<AnalysisService>;

    scraperService = {
      fetchJobText: jest.fn().mockResolvedValue('job description text'),
    } as unknown as jest.Mocked<ScraperService>;

    const mockCacheManager = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(cacheStore.get(key) ?? null),
        ),
      set: jest.fn().mockImplementation((key: string, value: unknown) => {
        cacheStore.set(key, value);
        return Promise.resolve();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [
        { provide: AnalysisService, useValue: analysisService },
        { provide: ScraperService, useValue: scraperService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    controller = module.get<AnalysisController>(AnalysisController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── happy path ─────────────────────────────────────────────────────────────

  describe('analyze — happy path', () => {
    it('returns AnalysisResult on successful pipeline', async () => {
      const result = await controller.analyze(MOCK_DTO);
      expect(result).toEqual(MOCK_RESULT);
    });

    it('calls scraper then analysis service in order', async () => {
      await controller.analyze(MOCK_DTO);
      expect(scraperService.fetchJobText).toHaveBeenCalledWith(MOCK_DTO.jobUrl);
      expect(analysisService.analyze).toHaveBeenCalled();
    });

    it('passes jobText from scraper into analysis service', async () => {
      scraperService.fetchJobText.mockResolvedValue('scraped job text');
      await controller.analyze(MOCK_DTO);
      expect(analysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({ jobText: 'scraped job text' }),
      );
    });

    it('forwards userProfile to analysis service when provided', async () => {
      const dto: AnalyzeJobDto = {
        ...MOCK_DTO,
        userProfile: { role: 'Engineer', skills: ['TypeScript'] },
      };
      await controller.analyze(dto);
      expect(analysisService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({ userProfile: dto.userProfile }),
      );
    });
  });

  // ── caching ────────────────────────────────────────────────────────────────

  describe('analyze — caching', () => {
    it('returns cached result without calling the pipeline', async () => {
      // Pre-populate the cache with the expected key
      await controller.analyze(MOCK_DTO); // first call populates cache
      scraperService.fetchJobText.mockClear();
      analysisService.analyze.mockClear();

      await controller.analyze(MOCK_DTO); // second call should hit cache

      expect(scraperService.fetchJobText).not.toHaveBeenCalled();
      expect(analysisService.analyze).not.toHaveBeenCalled();
    });

    it('calls pipeline on cache miss and stores result', async () => {
      await controller.analyze(MOCK_DTO);
      expect(analysisService.analyze).toHaveBeenCalledTimes(1);
      // Cache should now contain the result
      expect(cacheStore.size).toBe(1);
    });

    it('uses different cache keys for different URLs', async () => {
      await controller.analyze(MOCK_DTO);
      await controller.analyze({ jobUrl: 'https://example.com/other-job' });
      expect(analysisService.analyze).toHaveBeenCalledTimes(2);
    });

    it('uses different cache keys for different userProfiles', async () => {
      await controller.analyze(MOCK_DTO);
      await controller.analyze({
        ...MOCK_DTO,
        userProfile: { role: 'Senior Engineer' },
      });
      expect(analysisService.analyze).toHaveBeenCalledTimes(2);
    });
  });

  // ── stampede protection ────────────────────────────────────────────────────

  describe('analyze — stampede protection', () => {
    it('resolves concurrent requests for the same key to the same pipeline call', async () => {
      // Slow down the pipeline so concurrent calls all arrive before it settles
      analysisService.analyze.mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(MOCK_RESULT), 20)),
      );

      const [r1, r2, r3] = await Promise.all([
        controller.analyze(MOCK_DTO),
        controller.analyze(MOCK_DTO),
        controller.analyze(MOCK_DTO),
      ]);

      // All three should get the same result
      expect(r1).toEqual(MOCK_RESULT);
      expect(r2).toEqual(MOCK_RESULT);
      expect(r3).toEqual(MOCK_RESULT);

      // But only one pipeline run should have happened
      expect(analysisService.analyze).toHaveBeenCalledTimes(1);
    });
  });
});
