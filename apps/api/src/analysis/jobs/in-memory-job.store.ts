import { Injectable } from '@nestjs/common';
import { JobRecord } from './job-record.types';
import { JobStore } from './job-store.interface';

/**
 * Process-local job storage. Use when UPSTASH_REDIS_* is unset (e.g. local dev).
 */
@Injectable()
export class InMemoryJobStore implements JobStore {
  private readonly map = new Map<string, JobRecord>();

  async get(id: string): Promise<JobRecord | undefined> {
    return this.map.get(id);
  }

  async save(record: JobRecord): Promise<void> {
    this.map.set(record.id, record);
  }

  async delete(id: string): Promise<void> {
    this.map.delete(id);
  }

  async getAll(): Promise<JobRecord[]> {
    return [...this.map.values()];
  }

  async getSize(): Promise<number> {
    return this.map.size;
  }
}
