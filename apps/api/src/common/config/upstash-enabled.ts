import type { ConfigService } from '@nestjs/config';

/**
 * Whether to use Upstash for cache / Redis job store.
 * In development, Upstash is off by default so stale .env tokens do not 500 local requests.
 */
export function useUpstashRedis(config: ConfigService): boolean {
  const url = config.get<string>('UPSTASH_REDIS_REST_URL');
  const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN');
  if (!url?.trim() || !token?.trim()) {
    return false;
  }
  if (config.get<string>('DISABLE_UPSTASH') === 'true') {
    return false;
  }
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  if (nodeEnv === 'development') {
    return config.get<string>('UPSTASH_IN_DEVELOPMENT') === 'true';
  }
  return true;
}
