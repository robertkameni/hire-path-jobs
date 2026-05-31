import type { AnalyzeJobDto } from '../dto/analyze-job.dto.js';

export const ANALYSIS_QUEUE_NAME = 'analysis_queue';

export type AnalysisQueueJobPayload = {
  readonly jobId: string;
  readonly dto: AnalyzeJobDto;
  readonly cacheKey: string;
};
