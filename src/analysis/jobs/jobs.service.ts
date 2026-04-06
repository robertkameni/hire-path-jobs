import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AnalysisResult } from '../interfaces/analysis.types';
import type { IJobStore } from './job-store.interface';

export type JobStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'partial'
  | 'failed';

export interface JobRecord {
  id: string;
  status: JobStatus;
  result?: AnalysisResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Completed jobs are removed after this period of inactivity. */
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes
/** Hard cap — oldest job is evicted when the store is full. */
const MAX_JOBS = 1_000;
/** Cleanup sweep interval. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class JobsService implements IJobStore, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly store = new Map<string, JobRecord>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.sweep(), CLEANUP_INTERVAL_MS);
    // Allow the process to exit even with this timer running
    this.cleanupTimer.unref?.();
  }

  /** Create a new job record (status = 'queued') and return it. */
  create(): JobRecord {
    if (this.store.size >= MAX_JOBS) {
      this.evictOldest();
    }
    const record: JobRecord = {
      id: randomUUID(),
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(record.id, record);
    return record;
  }

  /**
   * Create a job that is already completed (e.g. served from cache).
   * The caller gets a jobId immediately at status='completed'.
   */
  createCompleted(result: AnalysisResult): JobRecord {
    const record = this.create();
    record.status = 'completed';
    record.result = result;
    return record;
  }

  /** @throws NotFoundException when the id is unknown or expired */
  get(id: string): JobRecord {
    const job = this.store.get(id);
    if (!job) throw new NotFoundException(`Job ${id} not found or expired`);
    return job;
  }

  setProcessing(id: string): void {
    this.patch(id, { status: 'processing' });
  }

  setCompleted(id: string, result: AnalysisResult): void {
    this.patch(id, { status: 'completed', result });
  }

  setPartial(id: string, result: AnalysisResult): void {
    this.patch(id, { status: 'partial', result });
  }

  setFailed(id: string, error: string): void {
    this.patch(id, { status: 'failed', error });
  }

  /** Count jobs currently waiting or executing (used for backpressure). */
  countPending(): number {
    let count = 0;
    for (const job of this.store.values()) {
      if (job.status === 'queued' || job.status === 'processing') count++;
    }
    return count;
  }

  private patch(id: string, fields: Partial<JobRecord>): void {
    const job = this.store.get(id);
    if (!job) return; // job may have been evicted — silently ignore
    Object.assign(job, fields, { updatedAt: new Date() });
  }

  private evictOldest(): void {
    let oldest: JobRecord | undefined;
    for (const job of this.store.values()) {
      if (!oldest || job.updatedAt < oldest.updatedAt) oldest = job;
    }
    if (oldest) {
      this.store.delete(oldest.id);
    }
  }

  private sweep(): void {
    const cutoff = Date.now() - JOB_TTL_MS;
    let count = 0;
    for (const [id, job] of this.store) {
      if (job.updatedAt.getTime() < cutoff) {
        this.store.delete(id);
        count++;
      }
    }
    if (count > 0) {
      this.logger.log(`Swept ${count} expired job record(s)`);
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
