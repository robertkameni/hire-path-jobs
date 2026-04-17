import type { CacheManagerOptions } from '@nestjs/cache-manager';
import { CacheModule } from '@nestjs/cache-manager';
import { type MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import Keyv from 'keyv';
import { LruKeyvStore } from './common/cache/lru-keyv.store';
import { UpstashKeyvStore } from './common/cache/upstash-keyv.store';

const ANALYSIS_CACHE_KEYV_NAMESPACE = 'hirepath-analysis-cache';

import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import * as Joi from 'joi';
import { AnalysisModule } from './analysis/analysis.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AppController } from './controllers/app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '../../.env',
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3000),
        GEMINI_API_KEY_BACKEND: Joi.string().required(),
        GEMINI_MODEL: Joi.string().default('gemini-2.5-flash'),
        AI_TIMEOUT_MS: Joi.number().default(45000),
        AI_CONCURRENCY: Joi.number().default(5),
        CORS_ORIGIN: Joi.string().default('*'),
        CACHE_TTL_SECONDS: Joi.number().default(86400),
        CACHE_MAX_ITEMS: Joi.number().default(500),
        THROTTLE_TTL_SECONDS: Joi.number().default(60),
        THROTTLE_LIMIT: Joi.number().default(10),
        SCRAPER_MIN_TEXT_LENGTH: Joi.number().default(100),
        SCRAPER_MAX_TEXT_CHARS: Joi.number().default(12000),
        UPSTASH_REDIS_REST_URL: Joi.string().uri().optional(),
        UPSTASH_REDIS_REST_TOKEN: Joi.string().optional(),
      }),
    }),
    // Rate limiting (TTL in seconds as per NestJS docs)
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): ThrottlerModuleOptions => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60),
            limit: config.get<number>('THROTTLE_LIMIT', 10),
          },
        ],
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CacheManagerOptions => {
        const ttlMs = config.get<number>('CACHE_TTL_SECONDS', 86400) * 1000;
        const url = config.get<string>('UPSTASH_REDIS_REST_URL');
        const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN');
        const base: CacheManagerOptions = { ttl: ttlMs };

        if (url && token) {
          const redis = new Redis({ url, token });
          const store = new UpstashKeyvStore(
            redis,
            `${ANALYSIS_CACHE_KEYV_NAMESPACE}:*`,
          );
          return {
            ...base,
            stores: [
              new Keyv({
                store,
                ttl: ttlMs,
                namespace: ANALYSIS_CACHE_KEYV_NAMESPACE,
              }),
            ],
          };
        }
        const maxItems = config.get<number>('CACHE_MAX_ITEMS', 500);
        return {
          ...base,
          stores: [
            new Keyv({
              store: new LruKeyvStore(maxItems),
              ttl: ttlMs,
              namespace: ANALYSIS_CACHE_KEYV_NAMESPACE,
            }),
          ],
        };
      },
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
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
