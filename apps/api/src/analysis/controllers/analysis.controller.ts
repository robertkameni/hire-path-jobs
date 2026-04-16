import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { AnalyzeJobDto } from '../dto/analyze-job.dto';
import { JobResponseDto } from '../dto/job-response.dto';
import { AnalysisPipelineService } from '../services/analysis-pipeline.service';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(
    private readonly analysisPipelineService: AnalysisPipelineService,
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
  async submit(@Body() dto: AnalyzeJobDto): Promise<JobResponseDto> {
    return this.analysisPipelineService.submit(dto);
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
      'Job status — status is one of: queued | processing | completed | failed | partial',
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
