import { BadGatewayException, Injectable, RequestTimeoutException, ServiceUnavailableException } from '@nestjs/common';
/** biome-ignore lint/style/useImportType: Needed for NestJS DI (emitDecoratorMetadata) to resolve JobTextExtractorService and ScraperHttpService at runtime. */
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import pLimit from 'p-limit';
import { StructuredLogger } from '../../common/logger/structured.logger';
import type { AiPort } from '../shared/ai.port';
import { CircuitBreaker } from '../shared/circuit-breaker';

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class AiService implements AiPort {
  private logger = new StructuredLogger(AiService.name);
  private client!: OpenAI;
  private model: string;
  private timeoutMs: number;
  private limit!: ReturnType<typeof pLimit>;
  private circuitBreaker = new CircuitBreaker(5, 30000);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const apiKey: string = this.configService.getOrThrow<string>('ai.apiKey');
    this.model = this.configService.get<string>('ai.model') ?? 'deepseek-chat';
    this.timeoutMs = this.configService.get<number>('ai.timeoutMs') ?? 45000;
    const concurrency: number = this.configService.get<number>('ai.concurrency') ?? 5;
    this.limit = pLimit(concurrency);
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async generateText(prompt: string, options?: { temperature?: number }): Promise<string> {
    return this.limit(() => this.executeGenerate(prompt, options));
  }

  private async executeGenerate(prompt: string, options?: { temperature?: number }) {
    if (this.circuitBreaker.isOpen()) {
      this.logger.warnEvent('circuit_breaker_open', {
        model: this.model,
        state: this.circuitBreaker.getState(),
      });
      throw new ServiceUnavailableException('AI provider circuit breaker is open — too many recent failures');
    }
    try {
      const result = await this.doRetryLoop(prompt, options);
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
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

  private async doRetryLoop(prompt: string, options?: { temperature?: number }) {
    this.logger.event('ai_request_start', { model: this.model });
    const temperature = options?.temperature ?? 0.2;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let response: OpenAI.Chat.Completions.ChatCompletion;
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
          throw new RequestTimeoutException(`AI provider timed out after ${this.timeoutMs / 1000}s`);
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

        throw new BadGatewayException(`AI provider error: ${err instanceof Error ? err.message : String(err)}`);
      }

      const content = response.choices?.[0]?.message?.content;

      if (!content) throw new BadGatewayException('AI provider returned an empty response');

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

  private isRetryable(err: unknown): boolean {
    if (!(err instanceof Error)) return false;

    const status = this.getNumberProp(err, 'status');
    if (status !== undefined) {
      if (status === 429 || (status >= 500 && status < 600)) return true;
    }

    const retryCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];

    const code = this.getStringProp(err, 'code');
    if (code !== undefined && retryCodes.includes(code)) {
      return true;
    }

    return err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT') || err.message.includes('socket hang up');
  }

  private isCircuitBreakerTriggering(err: unknown): boolean {
    if (err instanceof RequestTimeoutException) return true;
    if (!(err instanceof BadGatewayException)) return false;
    return true;
  }

  private getRetryDelay(err: unknown, attempt: number): number {
    const isRateLimit = err instanceof Error && this.getNumberProp(err, 'status') === 429;
    return isRateLimit ? attempt * 15000 : attempt * 1000;
  }

  private describeError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const status = this.getNumberProp(err, 'status');
    if (status !== undefined) return `HTTP ${status}`;
    const code = this.getStringProp(err, 'code');
    if (code !== undefined) return code;
    return err.message;
  }

  private stripMarkdownFences(text: string): string {
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/);
    return match ? match[1].trim() : trimmed;
  }

  private getStringProp(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as UnknownRecord;
    const prop = record[key];
    return typeof prop === 'string' ? prop : undefined;
  }

  private getNumberProp(value: unknown, key: string): number | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as UnknownRecord;
    const prop = record[key];
    return typeof prop === 'number' ? prop : undefined;
  }
}
