import { JobResponseDto } from '../dto/job-response.dto.js';
import type { JobRecord } from '../jobs/job-record.types.js';

export function mapJobRecordToJobResponseDto(job: JobRecord): JobResponseDto {
  const dto = new JobResponseDto();
  dto.jobId = job.id;
  dto.status = job.status;
  dto.result = job.result;
  dto.errorCode = job.errorCode;
  dto.error = job.error;
  dto.createdAt = job.createdAt.toISOString();
  dto.updatedAt = job.updatedAt.toISOString();
  return dto;
}
