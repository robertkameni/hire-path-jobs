import { LRUCache } from 'lru-cache';

/**
 * In-memory LRU Keyv adapter for local/dev when Upstash is not configured.
 * Uses lru-cache v11+ API ({ ttl } on set, delete, clear).
 */
export class LruKeyvStore {
  opts: { dialect: string };
  namespace?: string;
  private readonly cache: LRUCache<string, string>;

  constructor(maxItems: number) {
    this.cache = new LRUCache<string, string>({ max: maxItems });
    this.opts = { dialect: 'lru' };
  }

  on(_event: string, _listener: (...arguments_: unknown[]) => void): this {
    return this;
  }

  async get(key: string): Promise<string | undefined> {
    return this.cache.get(key);
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl !== undefined && ttl > 0) {
      this.cache.set(key, str, { ttl });
    } else {
      this.cache.set(key, str);
    }
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async disconnect(): Promise<void> {
    return;
  }
}
