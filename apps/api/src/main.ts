import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? '*' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

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

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}/api`);
}

void bootstrap();
