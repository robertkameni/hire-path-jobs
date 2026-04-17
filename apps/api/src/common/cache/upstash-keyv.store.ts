import type { Redis } from '@upstash/redis';

const DEFAULT_KEY_PATTERN = 'hirepath-analysis-cache:*';

/**
 * Keyv storage adapter backed by Upstash Redis REST. Used by global CacheModule for cross-instance cache hits.
 * clear() uses SCAN (not KEYS) to avoid blocking Redis on large keyspaces.
 */
export class UpstashKeyvStore {
  opts: { dialect: string };
  namespace?: string;
  private readonly redis: Redis;
  private readonly keyPattern: string;

  constructor(redis: Redis, keyPattern: string = DEFAULT_KEY_PATTERN) {
    this.redis = redis;
    this.keyPattern = keyPattern;
    this.opts = { dialect: 'upstash' };
  }

  on(_event: string, _listener: (...arguments_: unknown[]) => void): this {
    return this;
  }

  async get(key: string): Promise<string | undefined> {
    const raw = await this.redis.get<string>(key);
    if (raw === null || raw === undefined) {
      return undefined;
    }
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    if (ttl !== undefined && ttl > 0) {
      const ex = Math.max(1, Math.ceil(ttl / 1000));
      await this.redis.set(key, value as string, { ex });
    } else {
      await this.redis.set(key, value as string);
    }
    return true;
  }

  async delete(key: string): Promise<boolean> {
    await this.redis.del(key);
    return true;
  }

  async clear(): Promise<void> {
    const batchSize = 100;
    let cursor: string | number = '0';
    do {
      const result = await this.redis.scan(cursor, {
        match: this.keyPattern,
        count: batchSize,
      });
      const [nextCursor, keys] = result as [string, string[]];
      if (keys.length > 0) {
        for (let i = 0; i < keys.length; i += batchSize) {
          const chunk = keys.slice(i, i + batchSize);
          await this.redis.del(...chunk);
        }
      }
      cursor = nextCursor;
    } while (String(cursor) !== '0');
  }

  async disconnect(): Promise<void> {
    return;
  }
}
