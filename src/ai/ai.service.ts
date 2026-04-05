import {
  Injectable,
  Logger,
  OnModuleInit,
  BadGatewayException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import pLimit from 'p-limit';

const AI_TIMEOUT_MS = 45_000;
const AI_CONCURRENCY = 5;

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI;
  private model: string;
  private readonly limit = pLimit(AI_CONCURRENCY);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('ai.geminiApiKey')!;
    this.model =
      this.configService.get<string>('ai.model') ?? 'gemini-2.5-flash';

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
    this.logger.debug(`Calling Gemini model: ${this.model}`);

    const temperature = options?.temperature ?? 0.2;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

        let response: OpenAI.Chat.ChatCompletion;
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

        const content = response.choices[0]?.message?.content;

        if (!content) {
          throw new BadGatewayException(
            'AI provider returned an empty response',
          );
        }

        // Log token usage for cost visibility
        const usage = response.usage;
        if (usage) {
          this.logger.log(
            `Token usage — prompt: ${usage.prompt_tokens}, ` +
              `completion: ${usage.completion_tokens}, ` +
              `total: ${usage.total_tokens}`,
          );
        }

        return this.stripMarkdownFences(content);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new RequestTimeoutException(
            `AI provider timed out after ${AI_TIMEOUT_MS / 1000}s`,
          );
        }

        if (this.isRetryable(err) && attempt < maxRetries) {
          const delay = this.getRetryDelay(err, attempt);
          this.logger.warn(
            `Retryable error (${this.describeError(err)}). ` +
              `Retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new BadGatewayException(
          `AI provider error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    throw new BadGatewayException('AI provider max retries exceeded');
  }

  /** Returns true for errors that warrant an automatic retry. */
  private isRetryable(err: unknown): boolean {
    if (!(err instanceof Error)) return false;

    // HTTP status codes from the OpenAI-compatible client
    if ('status' in err) {
      const status = (err as { status: number }).status;
      if (status === 429 || (status >= 500 && status < 600)) return true;
    }

    // Node.js network error codes
    const retryCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
    if (
      'code' in err &&
      typeof (err as { code: unknown }).code === 'string' &&
      retryCodes.includes((err as { code: string }).code)
    ) {
      return true;
    }

    // Some environments surface network errors via the message instead of code
    return (
      err.message.includes('ECONNRESET') ||
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('socket hang up')
    );
  }

  /** Back-off delay: longer for rate limits, shorter for transient errors. */
  private getRetryDelay(err: unknown, attempt: number): number {
    const isRateLimit =
      err instanceof Error &&
      'status' in err &&
      (err as { status: number }).status === 429;
    return isRateLimit ? attempt * 5_000 : attempt * 1_000;
  }

  private describeError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    if ('status' in err) return `HTTP ${(err as { status: number }).status}`;
    if ('code' in err) return String((err as { code: unknown }).code);
    return err.message;
  }

  private stripMarkdownFences(text: string): string {
    const trimmed = text.trim();
    // If the entire response is wrapped in a single code block, extract just the inner content
    const match = trimmed.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/);
    return match ? match[1].trim() : trimmed;
  }
}
