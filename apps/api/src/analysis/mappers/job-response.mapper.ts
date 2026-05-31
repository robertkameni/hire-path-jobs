import type { JobResponseDto } from '../dto/job-response.dto.js';
import type { JobRecord } from '../jobs/job-record.types.js';

export function mapJobRecordToJobResponseDto(job: JobRecord): JobResponseDto {
  return {
    jobId: job.id,
    status: job.status,
    result: job.result,
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
