import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiPropertyOptional({
    example: 'Senior Backend Engineer',
    description: 'Your current or target job title',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    example: ['TypeScript', 'NestJS', 'Node.js'],
    description:
      'Your key skills — used to tailor the contact strategy and message',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}

export class AnalyzeJobDto {
  @ApiProperty({
    example: 'https://jobs.lever.co/acme/123',
    description: 'Publicly accessible URL of the job posting to analyze.',
  })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  jobUrl!: string;

  @ApiPropertyOptional({
    type: UserProfileDto,
    description:
      'Optional candidate profile — personalizes the strategy and outreach message',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserProfileDto)
  userProfile?: UserProfileDto;
}
