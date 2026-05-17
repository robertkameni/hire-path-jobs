import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalyzeJobDto } from '../dto/analyze-job.dto.js';
import { JobResponseDto } from '../dto/job-response.dto.js';
/** biome-ignore lint/style/useImportType: Needed for NestJS DI (emitDecoratorMetadata) to resolve JobTextExtractorService and ScraperHttpService at runtime. */
import { AnalysisPipelineService } from '../services/analysis-pipeline.service.js';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisPipelineService: AnalysisPipelineService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analyze a job posting',
    description:
      'Runs scrape → AI in the request and normally returns terminal status on this response. Duplicate parallel POSTs with the same cache key are queued. If clients still poll GET /analysis/:id, use Cache-Control/no-store URLs to avoid stale 304.',
  })
  @ApiBody({
    type: AnalyzeJobDto,
    examples: {
      url: {
        summary: 'Analyze by URL',
        value: { jobUrl: 'https://example.com/jobs/your-role' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Job outcome — normally completed/partial/failed in this payload; overlapping duplicate POSTs serialize per cache key',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — provide jobUrl and/or jobText (see AnalyzeJobDto constraints)',
  })
  @ApiResponse({ status: 429, description: 'Too many requests — IP throttle or analysis queue at capacity' })
  async submit(@Body() dto: AnalyzeJobDto): Promise<JobResponseDto> {
    return this.analysisPipelineService.submit(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get job analysis status and result',
    description: 'Returns the current status of the analysis job. Poll every 2–3 seconds. When status is "completed" the result field is populated.',
  })
  @ApiParam({ name: 'id', description: 'Job ID returned by POST /analysis' })
  @ApiResponse({
    status: 200,
    description: 'Job status — status is one of: queued | processing | completed | failed | partial',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found or expired (30 min TTL)',
  })
  async getJob(@Param('id') id: string): Promise<JobResponseDto> {
    return this.analysisPipelineService.getJob(id);
  }
}
