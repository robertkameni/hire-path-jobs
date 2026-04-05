import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { createHash } from 'crypto';
import { AnalysisService } from '../analysis.service';
import { ScraperService } from '../../scraper/scraper.service';
import { AnalyzeJobDto } from '../dto/analyze-job.dto';
import type { AnalysisResult } from '../interfaces/analysis.types';

@Controller('analysis')
export class AnalysisController {
  private readonly logger = new Logger(AnalysisController.name);
  // In-flight request deduplication: prevents cache stampede when multiple
  // concurrent requests arrive for the same key before the first one resolves.
  private readonly inFlight = new Map<string, Promise<AnalysisResult>>();

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly scraperService: ScraperService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async analyze(@Body() dto: AnalyzeJobDto): Promise<AnalysisResult> {
    const cacheKey = this.buildCacheKey(dto);
    const cached = await this.cacheManager.get<AnalysisResult>(cacheKey);

    if (cached) {
      this.logger.log(`Cache hit for key: ${cacheKey}`);
      return cached;
    }

    // If a request for this key is already in progress, attach to it instead
    // of starting a new pipeline — prevents duplicate scrapes and AI calls.
    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      this.logger.log(`Joining in-flight request for key: ${cacheKey}`);
      return existing;
    }

    const promise = this.runPipeline(dto, cacheKey).finally(() => {
      this.inFlight.delete(cacheKey);
    });

    this.inFlight.set(cacheKey, promise);
    return promise;
  }

  private async runPipeline(
    dto: AnalyzeJobDto,
    cacheKey: string,
  ): Promise<AnalysisResult> {
    const jobText = await this.scraperService.fetchJobText(dto.jobUrl);
    const result = await this.analysisService.analyze({
      jobText,
      userProfile: dto.userProfile,
    });
    await this.cacheManager.set(cacheKey, result);
    return result;
  }

  private buildCacheKey(dto: AnalyzeJobDto): string {
    const payload = dto.jobUrl + JSON.stringify(dto.userProfile ?? null);
    return createHash('sha256').update(payload).digest('hex');
  }
}
