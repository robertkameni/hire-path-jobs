/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from '../../src/analysis/analysis.service';
import { AiService } from '../../src/ai/ai.service';
import type { AnalysisResult } from '../../src/analysis/interfaces/analysis.types';

// p-limit is pure ESM — replace with a pass-through for Jest (CommonJS mode)
jest.mock('p-limit', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue((fn: () => unknown) => fn()),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_JOB = {
  title: 'Senior TypeScript Engineer',
  company: 'Acme Corp',
  location: 'Berlin, Germany',
  salary: '€80,000–€100,000',
  skills: ['TypeScript', 'Node.js', 'NestJS'],
  requirements: ['5+ years TypeScript', 'Experience with NestJS'],
  responsibilities: ['Build APIs', 'Mentor junior devs'],
  remote: true,
};

const VALID_INSIGHTS = {
  competitionLevel: 'medium' as const,
  competitionReason: 'TypeScript is popular but role is senior and geo-locked.',
  competitionConfidence: 72,
  signalsLoweringCompetition: ['Senior level', 'Specific framework (NestJS)'],
  signalsRaisingCompetition: ['Remote role', 'Trendy stack'],
  ghostRisk: 'low' as const,
  ghostRiskReason: 'Salary disclosed, specific team structure mentioned.',
  ghostRiskConfidence: 80,
  salaryFairness: 'market' as const,
  redFlags: [],
  positives: ['Salary transparently disclosed', 'Clear reporting structure'],
  verdict: { apply: true, reason: 'Solid role with low ghost risk.' },
};

const VALID_STRATEGY = {
  targetRole: 'Engineering Manager',
  contactChannels: ['LinkedIn InMail', 'Direct email'],
  talkingPoints: [
    'Experience with NestJS microservices',
    'Mentoring track record',
  ],
  timing: 'Apply within 48 hours — posting appears fresh.',
};

const VALID_MESSAGE = {
  subject: 'NestJS engineer excited about your API platform',
  body: 'Saw your posting for a Senior TypeScript Engineer. Your focus on NestJS microservices matches exactly what I have built at scale. Happy to share examples. Worth a 15-min call?',
  tone: 'friendly' as const,
};

function buildValidAiResponses(): string[] {
  return [
    JSON.stringify({ job: VALID_JOB, insights: VALID_INSIGHTS }),
    JSON.stringify(VALID_STRATEGY),
    JSON.stringify(VALID_MESSAGE),
  ];
}

function buildMockAiService(responses: string[]): jest.Mocked<AiService> {
  let callIndex = 0;
  return {
    generate: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(responses[callIndex++] ?? '{}'),
      ),
  } as unknown as jest.Mocked<AiService>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalysisService', () => {
  let service: AnalysisService;
  let aiService: jest.Mocked<AiService>;

  async function build(aiResponses: string[]) {
    aiService = buildMockAiService(aiResponses);
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnalysisService, { provide: AiService, useValue: aiService }],
    }).compile();
    service = module.get<AnalysisService>(AnalysisService);
  }

  // ── happy path ─────────────────────────────────────────────────────────────

  describe('analyze — happy path', () => {
    it('returns all four top-level keys', async () => {
      await build(buildValidAiResponses());
      const result = await service.analyze({ jobText: 'some job text' });
      expect(result).toHaveProperty('job');
      expect(result).toHaveProperty('insights');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('message');
    });

    it('calls AiService.generate exactly 3 times', async () => {
      await build(buildValidAiResponses());
      await service.analyze({ jobText: 'some job text' });
      expect(aiService.generate).toHaveBeenCalledTimes(3);
    });

    it('passes jobText to the first prompt', async () => {
      await build(buildValidAiResponses());
      const jobText = 'unique job description string';
      await service.analyze({ jobText });
      const firstCallArg = aiService.generate.mock.calls[0][0];
      expect(firstCallArg).toContain(jobText);
    });

    it('includes userProfile context in prompts when provided', async () => {
      await build(buildValidAiResponses());
      const userProfile = { role: 'Backend Engineer', skills: ['TypeScript'] };
      await service.analyze({ jobText: 'job text', userProfile });
      const strategyCallArg = aiService.generate.mock.calls[1][0];
      expect(strategyCallArg).toContain('Backend Engineer');
    });

    it('returns correct job title from AI response', async () => {
      await build(buildValidAiResponses());
      const result = await service.analyze({ jobText: 'job text' });
      expect(result.job?.title).toBe('Senior TypeScript Engineer');
    });

    it('returns insights with verdict', async () => {
      await build(buildValidAiResponses());
      const result: AnalysisResult = await service.analyze({
        jobText: 'job text',
      });
      expect(result.insights?.verdict).toEqual({
        apply: true,
        reason: expect.any(String),
      });
    });

    it('returns competition signals arrays', async () => {
      await build(buildValidAiResponses());
      const result = await service.analyze({ jobText: 'job text' });
      expect(Array.isArray(result.insights?.signalsLoweringCompetition)).toBe(
        true,
      );
      expect(Array.isArray(result.insights?.signalsRaisingCompetition)).toBe(
        true,
      );
    });

    it('returns numeric confidence values between 0 and 100', async () => {
      await build(buildValidAiResponses());
      const result = await service.analyze({ jobText: 'job text' });
      expect(result.insights?.competitionConfidence).toBeGreaterThanOrEqual(0);
      expect(result.insights?.competitionConfidence).toBeLessThanOrEqual(100);
      expect(result.insights?.ghostRiskConfidence).toBeGreaterThanOrEqual(0);
      expect(result.insights?.ghostRiskConfidence).toBeLessThanOrEqual(100);
    });

    it('returns status=complete and empty fallbacks on full success', async () => {
      await build(buildValidAiResponses());
      const result = await service.analyze({ jobText: 'job text' });
      expect(result.status).toBe('complete');
      expect(result.fallbacks).toHaveLength(0);
    });
  });

  // ── step failures — partial results ─────────────────────────────────────────
  // Steps no longer throw. Errors return AnalysisResult with status='partial'.

  describe('analyze — step failures return partial results', () => {
    it('returns partial with null fields when step 1 returns non-JSON', async () => {
      await build(['not valid json at all', '', '']);
      const result = await service.analyze({ jobText: 'raw job text' });
      expect(result.status).toBe('partial');
      expect(result.job).toBeNull();
      expect(result.insights).toBeNull();
      expect(result.strategy).toBeNull();
      expect(result.message).toBeNull();
      expect(result.fallbacks).toHaveLength(1);
      expect(result.fallbacks[0].step).toBe('parseJobAndTruth');
    });

    it('returns partial with null fields when step 1 JSON fails schema', async () => {
      const badStep1 = JSON.stringify({
        job: { title: 'Only title' },
        insights: {},
      });
      await build([badStep1, '', '']);
      const result = await service.analyze({ jobText: 'job text' });
      expect(result.status).toBe('partial');
      expect(result.job).toBeNull();
    });

    it('returns partial with null strategy when step 2 fails schema', async () => {
      const badStrategy = JSON.stringify({ targetRole: 'only field' }); // missing required keys
      await build([
        JSON.stringify({ job: VALID_JOB, insights: VALID_INSIGHTS }),
        badStrategy,
        JSON.stringify(VALID_MESSAGE),
      ]);
      const result = await service.analyze({ jobText: 'job text' });
      expect(result.status).toBe('partial');
      expect(result.job).not.toBeNull();
      expect(result.strategy).toBeNull();
      expect(result.message).toBeNull(); // skipped — strategy unavailable
      expect(result.fallbacks.some((f) => f.step === 'contactStrategy')).toBe(
        true,
      );
    });

    it('returns partial with template message when step 3 fails schema', async () => {
      const badMessage = JSON.stringify({ subject: 'Hi' }); // missing body + tone
      await build([
        JSON.stringify({ job: VALID_JOB, insights: VALID_INSIGHTS }),
        JSON.stringify(VALID_STRATEGY),
        badMessage,
      ]);
      const result = await service.analyze({ jobText: 'job text' });
      expect(result.status).toBe('partial');
      expect(result.strategy).not.toBeNull(); // step 2 succeeded
      expect(result.message).not.toBeNull(); // template fallback
      expect(result.fallbacks.some((f) => f.step === 'outreachMessage')).toBe(
        true,
      );
    });

    it('returns partial when step 1 sees pre-fenced JSON (defense-in-depth)', async () => {
      // AiService strips fences in production; this tests the runStep safety net
      const fenced = `\`\`\`json\n${JSON.stringify({ job: VALID_JOB, insights: VALID_INSIGHTS })}\n\`\`\``;
      await build([
        fenced,
        JSON.stringify(VALID_STRATEGY),
        JSON.stringify(VALID_MESSAGE),
      ]);
      const result = await service.analyze({ jobText: 'job text' });
      expect(result.status).toBe('partial');
      expect(result.job).toBeNull();
    });
  });
});
