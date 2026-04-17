import type { Redis } from '@upstash/redis';
import type { JobRecord } from './job-record.types';
import type { JobStore } from './job-store.interface';

const JOB_IDS_KEY = 'hirepath:analysis:job:ids';

function jobDataKey(id: string): string {
  return `hirepath:analysis:job:${id}`;
}

type SerializedJobRecord = {
  id: string;
  status: JobRecord['status'];
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

function serializeRecord(record: JobRecord): string {
  const payload: SerializedJobRecord = {
    id: record.id,
    status: record.status,
    result: record.result,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
  return JSON.stringify(payload);
}

function deserializeRecord(raw: string): JobRecord {
  const payload = JSON.parse(raw) as SerializedJobRecord;
  return {
    id: payload.id,
    status: payload.status,
    result: payload.result,
    error: payload.error,
    createdAt: new Date(payload.createdAt),
    updatedAt: new Date(payload.updatedAt),
  };
}

/**
 * Shared job storage using Upstash Redis (REST). Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */
export class RedisJobStore implements JobStore {
  constructor(private readonly redis: Redis) {}

  async get(id: string): Promise<JobRecord | undefined> {
    const raw = await this.redis.get<string>(jobDataKey(id));
    if (raw === null || raw === undefined) {
      return undefined;
    }
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return deserializeRecord(str);
  }

  async save(record: JobRecord): Promise<void> {
    await this.redis.set(jobDataKey(record.id), serializeRecord(record));
    await this.redis.sadd(JOB_IDS_KEY, record.id);
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(jobDataKey(id));
    await this.redis.srem(JOB_IDS_KEY, id);
  }

  async getAll(): Promise<JobRecord[]> {
    const ids = await this.redis.smembers<string[]>(JOB_IDS_KEY);
    if (ids.length === 0) {
      return [];
    }
    const values = await Promise.all(
      ids.map((jobId) => this.redis.get<string>(jobDataKey(jobId))),
    );
    const out: JobRecord[] = [];
    for (let i = 0; i < values.length; i++) {
      const raw = values[i];
      if (raw === null || raw === undefined) {
        continue;
      }
      const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
      try {
        out.push(deserializeRecord(str));
      } catch {}
    }
    return out;
  }

  async getSize(): Promise<number> {
    const n = await this.redis.scard(JOB_IDS_KEY);
    return typeof n === 'number' ? n : 0;
  }
}
