import { HttpClient } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import type { JobResponse, JobResult } from '@hire-path-jobs/shared-types';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { formatError } from '../shared/utils/format-error.utils';

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_WAIT_MS = 180000;

@Injectable({ providedIn: 'root' })
export class AnalysisResourceService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = () => environment.apiBaseUrl.replace(/\/$/, '');

  readonly isLoading = signal(false);

  readonly errorMessage = signal<string | null>(null);

  readonly needsJobText = signal(false);

  private readonly jobResponse = signal<JobResponse | null>(null);

  readonly result = computed<JobResult | null>(() => {
    return this.jobResponse()?.result ?? null;
  });

  readonly hasDisplayableAnalysis = computed(() => {
    const r = this.result();
    if (!r) return false;
    return !!(r.job || r.insights || r.strategy || r.message);
  });

  readonly insights = computed(() => this.result()?.insights ?? null);

  readonly strategy = computed(() => this.result()?.strategy ?? null);

  readonly message = computed(() => this.result()?.message ?? null);

  readonly fallbacks = computed(() => this.result()?.fallbacks ?? []);

  async submitJob(url: string, jobText?: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.needsJobText.set(false);
    try {
      const trimmedJobText = jobText?.trim();
      const trimmedUrl = url.trim();
      const postRes = await firstValueFrom(
        this.http.post<JobResponse>(`${this.baseUrl()}/analysis`, {
          ...(trimmedUrl ? { jobUrl: trimmedUrl } : {}),
          ...(trimmedJobText ? { jobText: trimmedJobText } : {}),
        }),
      );
      if (
        postRes.status === 'completed' ||
        postRes.status === 'partial' ||
        postRes.status === 'failed'
      ) {
        if (postRes.status === 'failed') {
          const msg = postRes.error ?? 'Analysis failed';
          if (postRes.errorCode === 'SCRAPE_BLOCKED') {
            this.needsJobText.set(true);
          }
          throw new Error(msg);
        }
        this.jobResponse.set(postRes);
        return;
      }
      const deadline = Date.now() + POLL_MAX_WAIT_MS;
      let job = postRes;
      while (
        job.status !== 'completed' &&
        job.status !== 'partial' &&
        job.status !== 'failed'
      ) {
        if (Date.now() > deadline) {
          throw new Error(
            'Analysis timed out while waiting for result. Try again or poll the job later.',
          );
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, POLL_INTERVAL_MS),
        );
        job = await firstValueFrom(
          this.http.get<JobResponse>(
            `${this.baseUrl()}/analysis/${postRes.jobId}`,
          ),
        );
      }
      if (job.status === 'failed') {
        const msg = job.error ?? 'Analysis failed';
        if (job.errorCode === 'SCRAPE_BLOCKED') {
          this.needsJobText.set(true);
        }
        throw new Error(msg);
      }
      this.jobResponse.set(job);
    } catch (err: unknown) {
      const msg = formatError(err);
      this.errorMessage.set(msg);
    } finally {
      this.isLoading.set(false);
    }
  }

  clear(): void {
    this.jobResponse.set(null);
    this.errorMessage.set(null);
    this.needsJobText.set(false);
  }
}
