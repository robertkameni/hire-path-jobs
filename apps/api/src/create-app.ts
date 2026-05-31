import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

type HelmetExpressMiddleware = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;
type HelmetFactory = (options?: Readonly<Record<string, unknown>>) => HelmetExpressMiddleware;

const require = createRequire(import.meta.url);
const helmet = require('helmet') as HelmetFactory;

export function configureHttpServer(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const corsRaw = config.get<string>('CORS_ORIGIN', '*').trim();
  let origin: boolean | string[] = true;
  if (corsRaw !== '*') {
    const list = corsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    origin = list.length > 0 ? list : true;
  }
  app.enableCors({
    origin,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Correlation-Id'],
    maxAge: 86400,
  });
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const spec = new DocumentBuilder()
    .setTitle('hire-path-jobs')
    .setDescription(
      'Send a job posting URL and get back structured job data, ' +
        'ghost risk analysis, competition level, contact strategy, and a ready-to-send outreach message.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, spec);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
