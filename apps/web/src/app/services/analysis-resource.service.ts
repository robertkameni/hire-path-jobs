import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { computed, Injectable, inject, signal } from '@angular/core';
import type { JobResponse, JobResult } from '@hire-path-jobs/shared-types';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { formatError } from '../shared/utils/format-error.utils';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_WAIT_MS = 180000;

export type AnalysisPollPhase = 'idle' | 'queued' | 'processing';

function isTerminalAnalysisJob(res: JobResponse): boolean {
  if (res.status === 'completed' || res.status === 'partial' || res.status === 'failed') return true;
  const r = res.result;
  if (r && typeof r === 'object') {
    const inner = r as { status?: string };
    if (inner.status === 'complete' || inner.status === 'partial') return true;
  }
  return false;
}

function isInProgressJob(res: JobResponse): boolean {
  return res.status === 'queued' || res.status === 'processing';
}

@Injectable({ providedIn: 'root' })
export class AnalysisResourceService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = () => environment.apiBaseUrl.replace(/\/$/, '');

  readonly isLoading = signal(false);

  readonly errorMessage = signal<string | null>(null);

  readonly needsJobText = signal(false);

  private readonly jobAccessToken = signal<string | null>(null);

  readonly pollPhase = signal<AnalysisPollPhase>('idle');

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
    this.pollPhase.set('idle');
    this.jobAccessToken.set(null);
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

      if (postRes.jobAccessToken) {
        this.jobAccessToken.set(postRes.jobAccessToken);
      }

      if (isInProgressJob(envelope)) {
        this.pollPhase.set(envelope.status === 'processing' ? 'processing' : 'queued');
      }

      if (!isTerminalAnalysisJob(envelope)) {
        const deadline = Date.now() + POLL_MAX_WAIT_MS;
        while (!isTerminalAnalysisJob(envelope)) {
          if (Date.now() > deadline) {
            throw new Error('Analysis timed out waiting for the job to finish. Ensure the API worker is running, or retry.');
          }
          await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          envelope = await this.pollJob(postRes.jobId);
          if (envelope.status === 'queued') {
            this.pollPhase.set('queued');
          } else if (envelope.status === 'processing') {
            this.pollPhase.set('processing');
          }
        }
      }

      if (envelope.status === 'failed') {
        const detail = envelope.error?.trim();
        const code = envelope.errorCode;
        const msg =
          detail && detail.length > 0 ? detail : code ? `Analysis failed (${code}).` : 'Analysis failed — no details from server. Check API logs.';
        if (envelope.errorCode === 'SCRAPE_BLOCKED' || envelope.errorCode === 'SCRAPE_FAILED') {
          this.needsJobText.set(true);
        }
        throw new Error(msg);
      }
      this.jobResponse.set(envelope);
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.errorMessage.set('Analysis session expired or access denied. Please submit again.');
      } else {
        this.errorMessage.set(formatError(err));
      }
    } finally {
      this.isLoading.set(false);
      this.pollPhase.set('idle');
      this.jobAccessToken.set(null);
    }
  }

  private pollJob(jobId: string): Promise<JobResponse> {
    const token = this.jobAccessToken();
    if (!token) {
      throw new Error('Missing job access token — cannot poll analysis status.');
    }
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return firstValueFrom(
      this.http.get<JobResponse>(`${this.baseUrl()}/analysis/${jobId}`, {
        headers,
        params: { _nocache: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
      }),
    );
  }

  clear(): void {
    this.jobResponse.set(null);
    this.errorMessage.set(null);
    this.needsJobText.set(false);
    this.jobAccessToken.set(null);
    this.pollPhase.set('idle');
  }
}
