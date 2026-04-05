import {
  IsUrl,
  IsOptional,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UserProfileDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: Array<string>;
}

export class AnalyzeJobDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  jobUrl!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserProfileDto)
  userProfile?: UserProfileDto;
}
