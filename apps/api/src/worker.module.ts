import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Joi from 'joi';
import { registerAnalysisModule } from './analysis/analysis.module.js';
import { AnalysisProcessor } from './analysis/processors/analysis.processor.js';
import { jobAccessSecretSchema } from './config/env.validation.js';

function buildBullRootModule(): ReturnType<typeof BullModule.forRootAsync> | null {
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

const bullRootModule = buildBullRootModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '../../.env',
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        DEEPSEEK_API_KEY: Joi.string().required(),
        DEEPSEEK_MODEL: Joi.string().default('deepseek-chat'),
        AI_TIMEOUT_MS: Joi.number().default(45000),
        AI_CONCURRENCY: Joi.number().default(5),
        CACHE_TTL_SECONDS: Joi.number().default(86400),
        CACHE_MAX_ITEMS: Joi.number().default(500),
        SCRAPER_MIN_TEXT_LENGTH: Joi.number().default(100),
        SCRAPER_MAX_TEXT_CHARS: Joi.number().default(12000),
        UPSTASH_REDIS_REST_URL: Joi.string().uri().optional(),
        UPSTASH_REDIS_REST_TOKEN: Joi.string().optional(),
        UPSTASH_REDIS_URL: Joi.string().uri().optional(),
        JOB_ACCESS_SECRET: jobAccessSecretSchema(),
        DISABLE_UPSTASH: Joi.string().valid('true', 'false').default('false'),
      }),
    }),
    ...(bullRootModule ? [bullRootModule] : []),
    registerAnalysisModule(),
  ],
  providers: [AnalysisProcessor],
})
export class WorkerModule {}
