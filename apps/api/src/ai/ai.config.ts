import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  geminiApiKey: process.env.GEMINI_API_KEY_BACKEND,
  model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
}));
