import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AnalysisResult } from '../interfaces/analysis.types';
import type { JobStatus } from '../jobs/jobs.service';

export class JobResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  jobId!: string;

  @ApiProperty({ enum: ['queued', 'processing', 'completed', 'failed'] })
  status!: JobStatus;

  @ApiPropertyOptional({
    description: 'Present when status is "completed"',
  })
  result?: AnalysisResult;

  @ApiPropertyOptional({
    description: 'Present when status is "failed"',
    example: 'AI provider timed out',
  })
  error?: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
