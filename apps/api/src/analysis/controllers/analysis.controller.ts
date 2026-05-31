import { Body, Controller, Get, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AnalyzeJobDto } from '../dto/analyze-job.dto.js';
import { JobResponseDto } from '../dto/job-response.dto.js';
import { JobAccessGuard } from '../guards/job-access.guard.js';
/** biome-ignore lint/style/useImportType: Needed for NestJS DI (emitDecoratorMetadata) to resolve AnalysisPipelineService at runtime. */
import { AnalysisPipelineService } from '../services/analysis-pipeline.service.js';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisPipelineService: AnalysisPipelineService) {}

  @Post()
  @ApiOperation({
    summary: 'Analyze a job posting',
    description:
      'Enqueues analysis and returns 202 with a jobAccessToken for polling. Cache hits return 200 immediately with the completed result. Duplicate parallel POSTs with the same cache key are serialized.',
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
    description: 'Cache hit — completed result in this payload',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 202,
    description: 'Job enqueued — poll GET /analysis/:id with Bearer jobAccessToken',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error — provide jobUrl and/or jobText (see AnalyzeJobDto constraints)',
  })
  @ApiResponse({ status: 429, description: 'Too many requests — IP throttle or analysis queue at capacity' })
  async submit(@Body() dto: AnalyzeJobDto, @Res({ passthrough: true }) res: Response): Promise<JobResponseDto> {
    const body = await this.analysisPipelineService.submit(dto);
    if (body.status === 'queued') {
      res.status(HttpStatus.ACCEPTED);
    } else {
      res.status(HttpStatus.OK);
    }
    return body;
  }

  @Get(':id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @UseGuards(JobAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get job analysis status and result',
    description: 'Requires Authorization: Bearer {jobAccessToken} from POST /analysis. Poll every 2–3 seconds until status is terminal.',
  })
  @ApiParam({ name: 'id', description: 'Job ID returned by POST /analysis' })
  @ApiResponse({
    status: 200,
    description: 'Job status — status is one of: queued | processing | completed | failed | partial',
    type: JobResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Missing or invalid job access token' })
  @ApiResponse({
    status: 404,
    description: 'Job not found or expired (30 min TTL)',
  })
  async getJob(@Param('id') id: string): Promise<JobResponseDto> {
    return this.analysisPipelineService.getJob(id);
  }
}
