import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI;
  private model: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('ai.geminiApiKey');
    this.model =
      this.configService.get<string>('ai.model') ?? 'gemini-2.0-flash';

    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is not set — AI calls will fail at runtime',
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  }

  async generate(prompt: string): Promise<string> {
    this.logger.debug(`Calling Gemini model: ${this.model}`);

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        });

        const content = response.choices[0]?.message?.content;

        if (!content) {
          throw new Error('Gemini returned an empty response');
        }

        return this.stripMarkdownFences(content);
      } catch (err: unknown) {
        const isRateLimit =
          err instanceof Error &&
          'status' in err &&
          (err as { status: number }).status === 429;

        if (isRateLimit && attempt < maxRetries) {
          const delay = attempt * 5000;
          this.logger.warn(
            `Rate limited. Retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  }

  private stripMarkdownFences(text: string): string {
    return text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
}
