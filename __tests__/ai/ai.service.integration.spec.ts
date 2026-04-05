/**
 * Integration tests for AiService — these make REAL network calls to the
 * Gemini API and require a valid GEMINI_API_KEY in the environment or .env.
 *
 * Run with: npm run test:integration
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiService } from '../../src/ai/ai.service';
import aiConfig from '../../src/ai/ai.config';

// p-limit is pure ESM — replace with a pass-through for Jest (CommonJS mode)
jest.mock('p-limit', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue((fn: () => unknown) => fn()),
}));

const API_KEY = process.env.GEMINI_API_KEY;

const describeIf = API_KEY
  ? describe
  : describe.skip.bind(
      describe,
      'AiService integration (GEMINI_API_KEY not set — skipped)',
    );

describeIf('AiService — real Gemini API', () => {
  let service: AiService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        ConfigModule.forFeature(aiConfig),
      ],
      providers: [AiService],
    }).compile();

    service = module.get<AiService>(AiService);
    await module.init(); // triggers OnModuleInit → builds the OpenAI client
  });

  it('returns a non-empty string for a simple prompt', async () => {
    const result = await service.generate('Reply with exactly the word: PONG');
    expect(typeof result).toBe('string');
    expect(result.trim().length).toBeGreaterThan(0);
  }, 60_000);

  it('strips markdown code fences from the response when present', async () => {
    const result = await service.generate(
      'Return exactly this text, no changes:\n```json\n{"ok":true}\n```',
    );
    // AiService strips fences before returning
    expect(result).not.toMatch(/^```/);
  }, 60_000);

  it('respects a custom temperature (does not throw)', async () => {
    const result = await service.generate(
      'List three primary colours, comma-separated.',
      { temperature: 0.0 },
    );
    expect(result.trim().length).toBeGreaterThan(0);
  }, 60_000);
});
