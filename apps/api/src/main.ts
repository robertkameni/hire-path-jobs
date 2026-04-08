import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // CORS — restrict to configured origin in production via CORS_ORIGIN env var
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
  });

  // Global API prefix — all routes become /api/...
  app.setGlobalPrefix('api');

  // Global validation pipe with auto-transform
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Graceful shutdown
  app.enableShutdownHooks();

  // Swagger setup
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}/api`);
}

void bootstrap();
