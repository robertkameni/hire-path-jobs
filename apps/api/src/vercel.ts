import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import type { NestExpressApplication } from '@nestjs/platform-express';

import { createConfiguredApplication } from './create-app.js';

declare const globalThis: typeof global & {
  __hirePathNestApp?: NestExpressApplication;
};

async function getCachedApp(): Promise<NestExpressApplication> {
  if (!globalThis.__hirePathNestApp) {
    globalThis.__hirePathNestApp = await createConfiguredApplication();
  }
  return globalThis.__hirePathNestApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const app = await getCachedApp();
  const expressApp = app.getHttpAdapter().getInstance() as (req: VercelRequest, res: VercelResponse) => void;
  expressApp(req, res);
}
