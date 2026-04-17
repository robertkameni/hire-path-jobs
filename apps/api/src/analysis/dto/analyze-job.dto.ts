import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidateNested,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

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
    description: 'Your key skills — used to tailor the contact strategy and message',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}

@ValidatorConstraint({ name: 'atLeastOneOfJobUrlOrJobText', async: false })
class AtLeastOneOfJobUrlOrJobTextConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as { jobUrl?: unknown; jobText?: unknown };
    const url = typeof obj.jobUrl === 'string' ? obj.jobUrl.trim() : '';
    const text = typeof obj.jobText === 'string' ? obj.jobText.trim() : '';
    return Boolean(url || text);
  }

  defaultMessage(): string {
    return 'Either jobUrl or jobText must be provided';
  }
}

export class AnalyzeJobDto {
  @ApiProperty({
    example: 'https://jobs.lever.co/acme/123',
    description: 'Publicly accessible URL of the job posting to analyze.',
  })
  @ValidateIf((o: AnalyzeJobDto) => !o.jobText?.trim())
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  jobUrl?: string;

  @ApiPropertyOptional({
    example: 'The job text to analyze',
    description: 'If provided, the job text will be used instead of scraping the job URL.',
  })
  @ValidateIf((o: AnalyzeJobDto) => !o.jobUrl?.trim())
  @IsString()
  @MinLength(200)
  @MaxLength(120000)
  jobText?: string;

  @Validate(AtLeastOneOfJobUrlOrJobTextConstraint)
  @ApiHideProperty()
  readonly _atLeastOne?: true;

  @ApiPropertyOptional({
    type: UserProfileDto,
    description: 'Optional candidate profile — personalizes the strategy and outreach message',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserProfileDto)
  userProfile?: UserProfileDto;
}
