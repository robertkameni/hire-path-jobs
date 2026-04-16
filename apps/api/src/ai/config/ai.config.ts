import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  geminiApiKey: process.env.GEMINI_API_KEY_BACKEND,
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 45000),
  concurrency: Number(process.env.AI_CONCURRENCY ?? 5),
}));
