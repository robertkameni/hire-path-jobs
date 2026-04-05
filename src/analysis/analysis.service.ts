import { Injectable, Logger } from '@nestjs/common';
import { AnalysisPipeline } from './analysis.pipeline';
import { AnalyzeJobDto } from './dto/analyze-job.dto';
import type { AnalysisResult } from './interfaces/analysis.types';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(private readonly pipeline: AnalysisPipeline) {}

  async analyze(dto: AnalyzeJobDto): Promise<AnalysisResult> {
    this.logger.log(`Received analysis request`);

    const result = await this.pipeline.runAnalysis({
      jobText: dto.jobText,
      userProfile: dto.userProfile,
    });

    return result;
  }
}
