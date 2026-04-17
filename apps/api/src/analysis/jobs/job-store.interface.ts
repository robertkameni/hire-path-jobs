import type { JobRecord } from './job-record.types';

/**
 * Persistence port for analysis job records. Implementations may be sync (in-memory) or async (Redis).
 */
export interface JobStore {
  get(id: string): Promise<JobRecord | undefined>;
  save(record: JobRecord): Promise<void>;
  delete(id: string): Promise<void>;
  getAll(): Promise<JobRecord[]>;
  getSize(): Promise<number>;
}
