import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { AppModule } from './app.module.js';
import { configureHttpServer } from './create-app.js';

const nestGlobal = globalThis as typeof globalThis & {
  __hirePathNestApp?: NestExpressApplication;
};

async function getCachedApp(): Promise<NestExpressApplication> {
  if (!nestGlobal.__hirePathNestApp) {
    const nest = await NestFactory.create<NestExpressApplication>(AppModule);
    configureHttpServer(nest);
    await nest.init();
    nestGlobal.__hirePathNestApp = nest;
  }
  return nestGlobal.__hirePathNestApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const app = await getCachedApp();
  const expressApp = app.getHttpAdapter().getInstance() as (req: VercelRequest, res: VercelResponse) => void;
  expressApp(req, res);
}
