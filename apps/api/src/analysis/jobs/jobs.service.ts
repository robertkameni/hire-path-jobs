import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class JobsService {
  private logger = new Logger(JobsService.name);
  private store = new Map<string, any>();
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.sweep(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref?.();
  }

  create() {
    if (this.store.size >= MAX_JOBS) {
      this.evictOldest();
    }
    const record = {
      id: randomUUID(),
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(record.id, record);
    return record;
  }

  createCompleted(result: any) {
    const record = this.create();
    record.status = 'completed';
    record.result = result;
    return record;
  }

  get(id: string) {
    const job = this.store.get(id);
    if (!job) throw new NotFoundException(`Job ${id} not found or expired`);
    return job;
  }

  setProcessing(id: string) {
    this.patch(id, { status: 'processing' });
  }

  setCompleted(id: string, result: any) {
    this.patch(id, { status: 'completed', result });
  }

  setPartial(id: string, result: any) {
    this.patch(id, { status: 'partial', result });
  }

  setFailed(id: string, error: string) {
    this.patch(id, { status: 'failed', error });
  }

  countPending() {
    let count = 0;
    for (const job of this.store.values()) {
      if (job.status === 'queued' || job.status === 'processing') count++;
    }
    return count;
  }

  private patch(id: string, fields: any) {
    const job = this.store.get(id);
    if (!job) return;
    Object.assign(job, fields, { updatedAt: new Date() });
  }

  private evictOldest() {
    let oldest: any | undefined;
    for (const job of this.store.values()) {
      if (!oldest || job.updatedAt < oldest.updatedAt) oldest = job;
    }
    if (oldest) this.store.delete(oldest.id);
  }

  private sweep() {
    const cutoff = Date.now() - JOB_TTL_MS;
    let count = 0;
    for (const [id, job] of this.store) {
      if (job.updatedAt.getTime() < cutoff) {
        this.store.delete(id);
        count++;
      }
    }
    if (count > 0) this.logger.log(`Swept ${count} expired job record(s)`);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }
}
