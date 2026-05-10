import { HttpClient } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import type { JobResponse, JobResult } from '@hire-path-jobs/shared-types';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { formatError } from '../shared/utils/format-error.utils';

/** One backoff GET only — the API awaits the pipeline on POST; polling was for legacy / flaky job-store races. */
const POST_NON_TERMINAL_RETRY_MS = 1200;

function isTerminalAnalysisJob(res: JobResponse): boolean {
  if (res.status === 'completed' || res.status === 'partial' || res.status === 'failed') return true;
  const r = res.result;
  if (r && typeof r === 'object') {
    const inner = r as { status?: string };
    if (inner.status === 'complete' || inner.status === 'partial') return true;
  }
  return false;
}

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
    if (this.isLoading()) return;
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
      let envelope: JobResponse = postRes;

      if (!isTerminalAnalysisJob(envelope)) {
        await new Promise<void>((resolve) => setTimeout(resolve, POST_NON_TERMINAL_RETRY_MS));
        envelope = await firstValueFrom(
          this.http.get<JobResponse>(`${this.baseUrl()}/analysis/${postRes.jobId}`, {
            params: { _nocache: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
          }),
        );
      }

      if (!isTerminalAnalysisJob(envelope)) {
        throw new Error('The API did not return a finished analysis. Use an API build that completes the job on POST, or retry in a moment.');
      }

      if (envelope.status === 'failed') {
        const msg = envelope.error ?? 'Analysis failed';
        if (envelope.errorCode === 'SCRAPE_BLOCKED' || envelope.errorCode === 'SCRAPE_FAILED') {
          this.needsJobText.set(true);
        }
        throw new Error(msg);
      }
      this.jobResponse.set(envelope);
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
