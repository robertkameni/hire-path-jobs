import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  jobId!: string;

  @ApiProperty({ enum: ['queued', 'processing', 'completed', 'failed'] })
  status!: 'queued' | 'processing' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: 'Present when status is "completed"' })
  result?: any;

  @ApiPropertyOptional({
    description: 'Present when status is "failed"',
    example: 'AI provider timed out',
  })
  error?: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
