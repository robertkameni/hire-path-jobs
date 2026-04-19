import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 45000),
  concurrency: Number(process.env.AI_CONCURRENCY ?? 5),
}));
