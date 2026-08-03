import { Logger } from '@nestjs/common';
import type { JobResponseDto } from '../dto/job-response.dto.js';
import type { JobRecord } from '../jobs/job-record.types.js';
import { ensureDecodedResultGuard } from '../utils/ai-structured-step.js';

const entityGuardLogger = new Logger('EntityGuard');

function guardDecodeResult(result: unknown): unknown {
  if (result === undefined || result === null) return result;
  return ensureDecodedResultGuard(result, (msg: string) => entityGuardLogger.warn(msg));
}

export function mapJobRecordToJobResponseDto(job: JobRecord): JobResponseDto {
  return {
    jobId: job.id,
    status: job.status,
    result: guardDecodeResult(job.result),
    errorCode: job.errorCode,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function mapJobRecordToPostJobResponseDto(job: JobRecord, jobAccessToken: string): JobResponseDto {
  return {
    ...mapJobRecordToJobResponseDto(job),
    jobAccessToken,
  };
}
