import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class UserProfileDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];
}

export class AnalyzeJobDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  jobText!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserProfileDto)
  userProfile?: UserProfileDto;
}
