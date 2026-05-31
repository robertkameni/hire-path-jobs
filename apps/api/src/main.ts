import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { configureHttpServer } from './create-app.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // F-3.4: Environment Guard for Production Secret Validation
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JOB_ACCESS_SECRET?.trim();
    if (!secret || secret.length < 32) {
      logger.error(
        'FATAL: JOB_ACCESS_SECRET is missing or too short in production. ' + 'Set a secure secret (min 32 characters) to enable production mode.',
      );
      process.exit(1);
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureHttpServer(app);
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on http://localhost:${String(port)}/api`);
}

void bootstrap();
