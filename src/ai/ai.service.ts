import {
  Injectable,
  OnModuleInit,
  BadGatewayException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import { CircuitBreaker } from './circuit-breaker';
import { StructuredLogger } from '../common/logger/structured.logger';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new StructuredLogger(AiService.name);
  private client!: OpenAI;
  private model!: string;
  private timeoutMs!: number;
  private limit!: ReturnType<typeof pLimit>;
  private readonly circuitBreaker = new CircuitBreaker(5, 30_000);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('ai.geminiApiKey')!;
    this.model =
      this.configService.get<string>('ai.model') ?? 'gemini-2.5-flash';
    this.timeoutMs = this.configService.get<number>('AI_TIMEOUT_MS', 45_000);
    const concurrency = this.configService.get<number>('AI_CONCURRENCY', 5);
    this.limit = pLimit(concurrency);

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }

  async generate(
    prompt: string,
    options?: { temperature?: number },
  ): Promise<string> {
    return this.limit(() => this.executeGenerate(prompt, options));
  }

  private async executeGenerate(
    prompt: string,
    options?: { temperature?: number },
  ): Promise<string> {
    if (this.circuitBreaker.isOpen()) {
      this.logger.warnEvent('circuit_breaker_open', {
        model: this.model,
        state: this.circuitBreaker.getState(),
      });
      throw new ServiceUnavailableException(
        'AI provider circuit breaker is open — too many recent failures',
      );
    }

    try {
      const result = await this.doRetryLoop(prompt, options);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err: unknown) {
      // Don't trip the breaker for request validation errors (4xx other than 429)
      const isProviderFailure = this.isCircuitBreakerTriggering(err);
      if (isProviderFailure) {
        this.circuitBreaker.recordFailure();
        this.logger.warnEvent('circuit_breaker_failure_recorded', {
          model: this.model,
          state: this.circuitBreaker.getState(),
          consecutiveFailures: this.circuitBreaker.getConsecutiveFailures(),
        });
      }
      throw err;
    }
  }

  private async doRetryLoop(
    prompt: string,
    options?: { temperature?: number },
  ): Promise<string> {
    this.logger.event('ai_request_start', { model: this.model });

    const temperature = options?.temperature ?? 0.2;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let response: OpenAI.Chat.ChatCompletion;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          response = await this.client.chat.completions.create(
            {
              model: this.model,
              messages: [{ role: 'user', content: prompt }],
              temperature,
            },
            { signal: controller.signal },
          );
        } finally {
          clearTimeout(timer);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new RequestTimeoutException(
            `AI provider timed out after ${this.timeoutMs / 1000}s`,
          );
        }

        if (this.isRetryable(err) && attempt < maxRetries) {
          const delay = this.getRetryDelay(err, attempt);
          this.logger.warnEvent('ai_retry', {
            model: this.model,
            attempt,
            maxRetries,
            delayMs: delay,
            error: this.describeError(err),
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new BadGatewayException(
          `AI provider error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      // --- Success path (outside the catch, no retry for bad content) ---
      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new BadGatewayException('AI provider returned an empty response');
      }

      const usage = response.usage;
      if (usage) {
        this.logger.event('ai_tokens', {
          model: this.model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        });
      }

      return this.stripMarkdownFences(content);
    }

    throw new BadGatewayException('AI provider max retries exceeded');
  }

  /** Returns true for errors that warrant an automatic retry. */
  private isRetryable(err: unknown): boolean {
    if (!(err instanceof Error)) return false;

    if ('status' in err) {
      const status = (err as { status: number }).status;
      if (status === 429 || (status >= 500 && status < 600)) return true;
    }

    const retryCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
    if (
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string' &&
      retryCodes.includes((err as { code: string }).code)
    ) {
      return true;
    }

    return (
      err.message.includes('ECONNRESET') ||
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('socket hang up')
    );
  }

  /**
   * Returns true for failures that should be counted toward circuit breaker
   * threshold. 4xx errors (except 429) are client mistakes, not provider
   * instability, so we skip them.
   */
  private isCircuitBreakerTriggering(err: unknown): boolean {
    if (err instanceof RequestTimeoutException) return true;
    if (!(err instanceof BadGatewayException)) return false;
    // BadGatewayException wraps 5xx / 429 / timeout / network errors
    return true;
  }

  private getRetryDelay(err: unknown, attempt: number): number {
    const isRateLimit =
      err instanceof Error &&
      'status' in err &&
      (err as { status: number }).status === 429;
    return isRateLimit ? attempt * 15_000 : attempt * 1_000;
  }

  private describeError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    if ('status' in err) return `HTTP ${(err as { status: number }).status}`;
    if ('code' in err) return String((err as { code: unknown }).code);
    return err.message;
  }

  private stripMarkdownFences(text: string): string {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/);
    return match ? match[1].trim() : trimmed;
  }
}
