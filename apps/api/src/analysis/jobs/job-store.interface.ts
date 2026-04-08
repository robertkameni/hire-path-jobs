import type { AnalysisResult } from '../interfaces/analysis.types';
import type { JobRecord } from './jobs.service';

/**
 * Persistence interface for job records.
 *
 * Currently implemented by JobsService (in-memory).
 * To migrate to Redis, create a RedisJobStore that implements this interface
 * and swap the provider in analysis.module.ts — no other code changes needed.
 */
export interface IJobStore {
  create(): JobRecord;
  createCompleted(result: AnalysisResult): JobRecord;
  get(id: string): JobRecord;
  countPending(): number;
  setProcessing(id: string): void;
  setCompleted(id: string, result: AnalysisResult): void;
  setPartial(id: string, result: AnalysisResult): void;
  setFailed(id: string, error: string): void;
}
