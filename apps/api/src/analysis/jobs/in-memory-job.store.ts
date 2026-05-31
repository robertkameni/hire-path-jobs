import { Injectable } from '@nestjs/common';
import type { JobRecord } from './job-record.types.js';
import type { JobStore } from './job-store.interface.js';

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
