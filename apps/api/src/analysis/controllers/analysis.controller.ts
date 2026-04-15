import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AnalysisService } from '../services/analysis.service';
import { ScraperService } from '../../scraper/scraper.service';
import { JobsService } from '../jobs/jobs.service';
import { AnalyzeJobDto } from '../dto/analyze-job.dto';
import { JobResponseDto } from '../dto/job-response.dto';
import { StructuredLogger } from '../../common/logger/structured.logger';

const MAX_QUEUE_DEPTH = 50;

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  private logger = new StructuredLogger(AnalysisController.name);

  constructor(
    private analysisService: AnalysisService,
    private scraperService: ScraperService,
    private jobsService: JobsService,
    @Inject(CACHE_MANAGER) private cacheManager: any,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Analyze a job posting',
    description:
      'Accepts a job URL. Starts the pipeline (scrape → AI) in the background and returns the job immediately; poll GET /analysis/:id until status is completed, partial, or failed.',
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
    description:
      'Job created or cache hit — body includes jobId and status (processing until done; use GET to poll)',
    type: JobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Validation error — jobUrl is required and must be a valid URL',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async submit(@Body() dto: AnalyzeJobDto) {
    const pending = await this.jobsService.countPending();
    if (pending >= MAX_QUEUE_DEPTH) {
      throw new HttpException(
        'Queue at capacity — try again shortly',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const cacheKey = this.buildCacheKey(dto);
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      this.logger.event('cache_hit', { cacheKey: cacheKey.slice(0, 16) });
      const job = await this.jobsService.createCompleted(cached);
      return this.toDto(job);
    }
    const job = await this.jobsService.create();
    await this.jobsService.setProcessing(job.id);
    this.logger.event('pipeline_start', { jobId: job.id });
    void this.runPipeline(job.id, dto, cacheKey).catch(async (err: unknown) => {
      const message =
        err instanceof Error ? err.message : 'Unknown error during analysis';
      this.logger.event('pipeline_unhandled', {
        jobId: job.id,
        message,
      });
      await this.jobsService.setFailed(job.id, message);
    });
    return this.toDto(await this.jobsService.get(job.id));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get job analysis status and result',
    description:
      'Returns the current status of the analysis job. Poll every 2–3 seconds. When status is "completed" the result field is populated.',
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
  async getJob(@Param('id') id: string) {
    const job = await this.jobsService.get(id);
    return this.toDto(job);
  }

  private async runPipeline(jobId: string, dto: any, cacheKey: string) {
    try {
      const jobText = await this.scraperService.fetchJobText(dto.jobUrl);
      const result = await this.analysisService.analyze({
        jobText,
        userProfile: dto.userProfile,
        jobId,
      });
      await this.cacheManager.set(cacheKey, result);
      if (result.status === 'partial') {
        await this.jobsService.setPartial(jobId, result);
      } else {
        await this.jobsService.setCompleted(jobId, result);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error during analysis';
      await this.jobsService.setFailed(jobId, message);
    }
  }

  private buildCacheKey(dto: any) {
    const payload = dto.jobUrl + JSON.stringify(dto.userProfile ?? null);
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  private toDto(job: any) {
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
