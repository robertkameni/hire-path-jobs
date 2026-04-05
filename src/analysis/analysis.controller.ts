import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
import { AnalyzeJobDto } from './dto/analyze-job.dto';
import type { AnalysisResult } from './interfaces/analysis.types';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async analyze(@Body() dto: AnalyzeJobDto): Promise<AnalysisResult> {
    return this.analysisService.analyze(dto);
  }
}
