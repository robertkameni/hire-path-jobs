import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../src/ai/ai.service';
import OpenAI from 'openai';

// p-limit is pure ESM — replace with a pass-through for Jest (CommonJS mode)
jest.mock('p-limit', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue((fn: () => unknown) => fn()),
}));

// ---------------------------------------------------------------------------
// Mock openai
// ---------------------------------------------------------------------------

jest.mock('openai');

function buildChatResponse(content: string): OpenAI.Chat.ChatCompletion {
  return {
    id: 'test-id',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gemini-2.5-flash',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content, refusal: null },
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

function buildOpenAiError(status: number): Error & { status: number } {
  const err = new Error(`HTTP error ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

function buildNetworkError(code: string): Error & { code: string } {
  const err = new Error(code) as Error & { code: string };
  err.code = code;
  return err;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('AiService', () => {
  let service: AiService;
  let mockCreate: jest.Mock;

  beforeEach(async () => {
    mockCreate = jest.fn();

    // Patch the OpenAI constructor to return our mock client
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'ai.geminiApiKey') return 'test-api-key';
              if (key === 'ai.model') return 'gemini-2.5-flash';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    service.onModuleInit(); // wire up the client
  });

  afterEach(() => jest.clearAllMocks());

  // ── happy path ─────────────────────────────────────────────────────────────

  describe('generate — happy path', () => {
    it('returns the content string from the API', async () => {
      mockCreate.mockResolvedValue(buildChatResponse('{"result": true}'));
      const result = await service.generate('some prompt');
      expect(result).toBe('{"result": true}');
    });

    it('strips json markdown fences', async () => {
      mockCreate.mockResolvedValue(
        buildChatResponse('```json\n{"key": "value"}\n```'),
      );
      const result = await service.generate('some prompt');
      expect(result).toBe('{"key": "value"}');
    });

    it('strips plain markdown fences', async () => {
      mockCreate.mockResolvedValue(
        buildChatResponse('```\n{"key": "value"}\n```'),
      );
      const result = await service.generate('some prompt');
      expect(result).toBe('{"key": "value"}');
    });

    it('passes temperature option to the API', async () => {
      mockCreate.mockResolvedValue(buildChatResponse('ok'));
      await service.generate('prompt', { temperature: 0.7 });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7 }),
        expect.anything(),
      );
    });

    it('defaults to temperature 0.2 when not specified', async () => {
      mockCreate.mockResolvedValue(buildChatResponse('ok'));
      await service.generate('prompt');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.2 }),
        expect.anything(),
      );
    });
  });

  // ── empty response ─────────────────────────────────────────────────────────

  describe('generate — empty response', () => {
    it('throws BadGatewayException when content is null', async () => {
      mockCreate.mockResolvedValue(
        buildChatResponse(null as unknown as string),
      );
      await expect(service.generate('prompt')).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('throws BadGatewayException when choices array is empty', async () => {
      mockCreate.mockResolvedValue({ choices: [], usage: null });
      await expect(service.generate('prompt')).rejects.toThrow(
        BadGatewayException,
      );
    });
  });

  // ── timeout ────────────────────────────────────────────────────────────────

  describe('generate — timeout', () => {
    it('throws RequestTimeoutException on AbortError', async () => {
      mockCreate.mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });
      await expect(service.generate('prompt')).rejects.toThrow(
        RequestTimeoutException,
      );
    });
  });

  // ── retry logic ────────────────────────────────────────────────────────────

  describe('generate — retry', () => {
    it('retries on 429 and succeeds on second attempt', async () => {
      mockCreate
        .mockRejectedValueOnce(buildOpenAiError(429))
        .mockResolvedValue(buildChatResponse('success'));

      // Speed up delay to avoid slow tests
      jest.useFakeTimers();
      const promise = service.generate('prompt');
      // Advance through the backoff delay
      await jest.runAllTimersAsync();
      const result = await promise;
      jest.useRealTimers();

      expect(result).toBe('success');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 and succeeds on second attempt', async () => {
      mockCreate
        .mockRejectedValueOnce(buildOpenAiError(503))
        .mockResolvedValue(buildChatResponse('ok'));

      jest.useFakeTimers();
      const promise = service.generate('prompt');
      await jest.runAllTimersAsync();
      const result = await promise;
      jest.useRealTimers();

      expect(result).toBe('ok');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('retries on ECONNRESET network error', async () => {
      mockCreate
        .mockRejectedValueOnce(buildNetworkError('ECONNRESET'))
        .mockResolvedValue(buildChatResponse('ok'));

      jest.useFakeTimers();
      const promise = service.generate('prompt');
      await jest.runAllTimersAsync();
      const result = await promise;
      jest.useRealTimers();

      expect(result).toBe('ok');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('throws BadGatewayException after exhausting all retries (429)', async () => {
      mockCreate.mockRejectedValue(buildOpenAiError(429));

      jest.useFakeTimers();

      // Attach .rejects immediately so the rejection is never left unhandled
      const assertion = expect(service.generate('prompt')).rejects.toThrow(
        BadGatewayException,
      );

      await jest.runAllTimersAsync();
      await assertion;

      jest.useRealTimers();
      expect(mockCreate).toHaveBeenCalledTimes(3); // maxRetries = 3
    });

    it('does not retry on non-retryable 400 error', async () => {
      mockCreate.mockRejectedValue(buildOpenAiError(400));
      await expect(service.generate('prompt')).rejects.toThrow(
        BadGatewayException,
      );
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });
});
