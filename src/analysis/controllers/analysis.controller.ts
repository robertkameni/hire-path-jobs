import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  HttpException,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { AnalysisService } from '../services/analysis.service';
import { ScraperService } from '../../scraper/scraper.service';
import { JobsService } from '../jobs/jobs.service';
import { AnalyzeJobDto } from '../dto/analyze-job.dto';
import { JobResponseDto } from '../dto/job-response.dto';
import { StructuredLogger } from '../../common/logger/structured.logger';
import type { AnalysisResult } from '../interfaces/analysis.types';

/** Maximum number of jobs in queued or processing state before rejecting new submissions. */
const MAX_QUEUE_DEPTH = 50;

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  private readonly logger = new StructuredLogger(AnalysisController.name);

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly scraperService: ScraperService,
    private readonly jobsService: JobsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Submit a job for analysis.
   * Returns immediately with a jobId.
   * Poll GET /analysis/:id every 2–3 seconds until status is 'completed' or 'failed'.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analyze a job posting',
    description:
      'Accepts a job URL. Runs the full pipeline (scrape → 3 AI calls) synchronously and returns the result.',
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
    description: 'Analysis complete',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error — jobUrl is required and must be a valid URL',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async submit(@Body() dto: AnalyzeJobDto): Promise<JobResponseDto> {
    const pending = this.jobsService.countPending();
    if (pending >= MAX_QUEUE_DEPTH) {
      throw new HttpException(
        'Queue at capacity — try again shortly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cacheKey = this.buildCacheKey(dto);
    const cached = await this.cacheManager.get<AnalysisResult>(cacheKey);

    if (cached) {
      this.logger.event('cache_hit', { cacheKey: cacheKey.slice(0, 16) });
      const job = this.jobsService.createCompleted(cached);
      return this.toDto(job);
    }

    const job = this.jobsService.create();
    this.logger.event('pipeline_start', { jobId: job.id });

    await this.runPipeline(job.id, dto, cacheKey);

    return this.toDto(this.jobsService.get(job.id));
  }

  /**
   * Poll for job status.
   * Returns the full AnalysisResult once status is 'completed'.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get job analysis status and result',
    description:
      'Returns the current status of the analysis job. ' +
      'Poll every 2–3 seconds. When status is "completed" the result field is populated.',
  })
  @ApiParam({ name: 'id', description: 'Job ID returned by POST /analysis' })
  @ApiResponse({
    status: 200,
    description:
      'Job status — status is one of: queued | processing | completed | failed',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Job not found or expired (30 min TTL)',
  })
  getJob(@Param('id') id: string): JobResponseDto {
    const job = this.jobsService.get(id);
    return this.toDto(job);
  }

  private async runPipeline(
    jobId: string,
    dto: AnalyzeJobDto,
    cacheKey: string,
  ): Promise<void> {
    this.jobsService.setProcessing(jobId);
    try {
      const jobText = await this.scraperService.fetchJobText(dto.jobUrl);

      const result = await this.analysisService.analyze({
        jobText,
        userProfile: dto.userProfile,
        jobId,
      });

      await this.cacheManager.set(cacheKey, result);

      if (result.status === 'partial') {
        this.jobsService.setPartial(jobId, result);
      } else {
        this.jobsService.setCompleted(jobId, result);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unknown error during analysis';
      this.jobsService.setFailed(jobId, message);
    }
  }

  private buildCacheKey(dto: AnalyzeJobDto): string {
    const payload = dto.jobUrl + JSON.stringify(dto.userProfile ?? null);
    return createHash('sha256').update(payload).digest('hex');
  }

  private toDto(job: import('../jobs/jobs.service').JobRecord): JobResponseDto {
    const dto = new JobResponseDto();
    dto.jobId = job.id;
    dto.status = job.status;
    dto.result = job.result;
    dto.error = job.error;
    dto.createdAt = job.createdAt.toISOString();
    dto.updatedAt = job.updatedAt.toISOString();
    return dto;
  }
}
