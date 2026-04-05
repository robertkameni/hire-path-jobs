import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { AnalysisPipeline } from './analysis.pipeline';
import { AiModule } from 'src/ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisPipeline],
})
export class AnalysisModule {}
