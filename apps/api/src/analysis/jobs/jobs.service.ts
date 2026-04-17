import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { JobRecord } from './job-record.types';
import type { JobStore } from './job-store.interface';
import { JOB_STORE } from './job-store.token';

const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class JobsService implements OnModuleDestroy {
  private logger = new Logger(JobsService.name);
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(@Inject(JOB_STORE) private readonly jobStore: JobStore) {
    this.cleanupTimer = setInterval(() => {
      void this.sweep().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Job sweep failed: ${message}`);
      });
    }, CLEANUP_INTERVAL_MS);
  }

  async create(): Promise<JobRecord> {
    if ((await this.jobStore.getSize()) >= MAX_JOBS) {
      await this.evictOldest();
    }
    const record: JobRecord = {
      id: crypto.randomUUID(),
      status: 'queued',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.jobStore.save(record);
    return record;
  }

  async createCompleted(result: unknown): Promise<JobRecord> {
    const record = await this.create();
    record.status = 'completed';
    record.result = result;
    await this.jobStore.save(record);
    return record;
  }

  async get(id: string): Promise<JobRecord> {
    const job = await this.jobStore.get(id);
    if (!job) throw new NotFoundException(`Job ${id} not found or expired`);
    return job;
  }

  async setProcessing(id: string): Promise<void> {
    await this.patch(id, { status: 'processing' });
  }

  async setCompleted(id: string, result: unknown): Promise<void> {
    await this.patch(id, { status: 'completed', result });
  }

  async setPartial(id: string, result: unknown): Promise<void> {
    await this.patch(id, { status: 'partial', result });
  }

  async setFailed(id: string, error: string): Promise<void> {
    await this.patch(id, { status: 'failed', error });
  }

  async countPending(): Promise<number> {
    let count = 0;
    for (const job of await this.jobStore.getAll()) {
      if (job.status === 'queued' || job.status === 'processing') count++;
    }
    return count;
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private async patch(
    id: string,
    fields: Partial<Pick<JobRecord, 'status' | 'result' | 'error'>>,
  ): Promise<void> {
    const job = await this.jobStore.get(id);
    if (!job) return;
    Object.assign(job, fields, { updatedAt: new Date() });
    await this.jobStore.save(job);
  }

  private async evictOldest(): Promise<void> {
    let oldest: JobRecord | undefined;
    for (const job of await this.jobStore.getAll()) {
      if (!oldest || job.updatedAt < oldest.updatedAt) oldest = job;
    }
    if (oldest) await this.jobStore.delete(oldest.id);
  }

  private async sweep(): Promise<void> {
    const cutoff = Date.now() - JOB_TTL_MS;
    let count = 0;
    for (const job of await this.jobStore.getAll()) {
      if (job.updatedAt.getTime() < cutoff) {
        await this.jobStore.delete(job.id);
        count++;
      }
    }
    if (count > 0) this.logger.log(`Swept ${count} expired job record(s)`);
  }
}
