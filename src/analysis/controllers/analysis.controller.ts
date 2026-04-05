import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AnalysisService } from '../analysis.service';
import { ScraperService } from '../../scraper/scraper.service';
import { AnalyzeJobDto } from '../dto/analyze-job.dto';
import type { AnalysisResult } from '../interfaces/analysis.types';

@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly analysisService: AnalysisService,
    private readonly scraperService: ScraperService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async analyze(@Body() dto: AnalyzeJobDto): Promise<AnalysisResult> {
    const jobText = await this.scraperService.fetchJobText(dto.jobUrl);
    return this.analysisService.analyze({
      jobText,
      userProfile: dto.userProfile,
    });
  }
}
