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
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // F-3.6: Explicit CORS Origin Restriction
  let origin: boolean | string[];
  if (nodeEnv === 'production') {
    const corsRaw = config.get<string>('CORS_ORIGIN', '').trim();
    if (!corsRaw) {
      throw new Error('FATAL: CORS_ORIGIN must be explicitly configured in production. ' + 'Provide a comma-separated list of allowed origins.');
    }
    const list = corsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    origin = list.length > 0 ? list : false;
    if (!origin || (Array.isArray(origin) && origin.length === 0)) {
      throw new Error('FATAL: CORS_ORIGIN resulted in empty origin list. ' + 'Provide at least one valid origin for production.');
    }
  } else {
    // Development: allow all origins by default, or respect explicit config
    const corsRaw = config.get<string>('CORS_ORIGIN', '*').trim();
    if (corsRaw === '*') {
      origin = true;
    } else {
      const list = corsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      origin = list.length > 0 ? list : true;
    }
  }

  app.enableCors({
    origin,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Correlation-Id'],
    maxAge: 86400,
    credentials: true,
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

  // F-3.5: Environment Guard for Swagger/OpenAPI Documentation
  if (nodeEnv !== 'production') {
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
}
