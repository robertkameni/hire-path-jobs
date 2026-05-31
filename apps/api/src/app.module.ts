import { BullModule } from '@nestjs/bullmq';
import type { CacheManagerOptions } from '@nestjs/cache-manager';
import { CacheModule } from '@nestjs/cache-manager';
import { type MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { LruKeyvStore } from './common/cache/lru-keyv.store.js';
import { UpstashKeyvStore } from './common/cache/upstash-keyv.store.js';

const ANALYSIS_CACHE_KEYV_NAMESPACE = 'hirepath-analysis-cache';

import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';
import Joi from 'joi';
import { registerAnalysisModule } from './analysis/analysis.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware.js';
import { jobAccessSecretSchema } from './config/env.validation.js';
import { AppController } from './controllers/app.controller.js';

function buildBullModuleImport(): ReturnType<typeof BullModule.forRootAsync> | null {
  const redisUrl = process.env.UPSTASH_REDIS_URL?.trim();
  if (!redisUrl) return null;

  return BullModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const url = config.get<string>('UPSTASH_REDIS_URL')?.trim() ?? redisUrl;
      return {
        connection: {
          url,
          maxRetriesPerRequest: null,
          ...(url.startsWith('rediss://') ? { tls: {} } : {}),
        },
      };
    },
  });
}

const bullRootModule = buildBullModuleImport();

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '../../.env',
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        DEEPSEEK_API_KEY: Joi.string().required(),
        DEEPSEEK_MODEL: Joi.string().default('deepseek-chat'),
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
        UPSTASH_REDIS_URL: Joi.string().uri().optional(),
        JOB_ACCESS_SECRET: jobAccessSecretSchema(),
        DISABLE_UPSTASH: Joi.string().valid('true', 'false').default('false'),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): ThrottlerModuleOptions => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60),
            limit: config.get<number>('THROTTLE_LIMIT', 10),
          },
        ],
        skipIf: (ctx) => ctx.switchToHttp().getRequest<{ method?: string }>().method === 'OPTIONS',
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CacheManagerOptions => {
        const ttlMs = config.get<number>('CACHE_TTL_SECONDS', 86400) * 1000;
        const base: CacheManagerOptions = {
          ttl: ttlMs,
          namespace: ANALYSIS_CACHE_KEYV_NAMESPACE,
        };

        const url = config.get<string>('UPSTASH_REDIS_REST_URL')?.trim();
        const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN')?.trim();
        const useUpstash = Boolean(url && token) && config.get<string>('DISABLE_UPSTASH') !== 'true';

        if (useUpstash && url && token) {
          const redis = new Redis({ url, token });
          const store = new UpstashKeyvStore(redis, `${ANALYSIS_CACHE_KEYV_NAMESPACE}:*`);
          return {
            ...base,
            stores: [store],
          };
        }
        const maxItems = config.get<number>('CACHE_MAX_ITEMS', 500);
        return {
          ...base,
          stores: [new LruKeyvStore(maxItems)],
        };
      },
    }),
    ...(bullRootModule ? [bullRootModule] : []),
    registerAnalysisModule(),
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
    consumer.apply(CorrelationIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
