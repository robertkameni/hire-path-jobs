import type { JobRecord } from './job-record.types.js';

export interface JobStore {
  get(id: string): Promise<JobRecord | undefined>;
  save(record: JobRecord): Promise<void>;
  delete(id: string): Promise<void>;
  getAll(): Promise<JobRecord[]>;
  getSize(): Promise<number>;
}
