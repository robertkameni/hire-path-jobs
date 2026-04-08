import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AppController } from './controllers/app.controller';
import { AnalysisModule } from './analysis/analysis.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        GEMINI_API_KEY_BACKEND: Joi.string().required(),
        GEMINI_MODEL: Joi.string().default('gemini-2.5-flash'),
        AI_TIMEOUT_MS: Joi.number().default(45_000),
        AI_CONCURRENCY: Joi.number().default(5),
        CORS_ORIGIN: Joi.string().default('*'),
        CACHE_TTL_SECONDS: Joi.number().default(86400),
        CACHE_MAX_ITEMS: Joi.number().default(500),
        THROTTLE_TTL_SECONDS: Joi.number().default(60),
        THROTTLE_LIMIT: Joi.number().default(10),
        SCRAPER_MIN_TEXT_LENGTH: Joi.number().default(100),
        SCRAPER_MAX_TEXT_CHARS: Joi.number().default(12_000),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 10),
        },
      ],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ttl: config.get<number>('CACHE_TTL_SECONDS', 86400) * 1000,
        max: config.get<number>('CACHE_MAX_ITEMS', 500),
      }),
    }),
    AnalysisModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
