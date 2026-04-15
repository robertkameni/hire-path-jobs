import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, resource, signal } from '@angular/core';
import { JobResponse, JobResult } from '@hire-path-jobs/shared-types';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

type AnalysisRequest = { kind: 'submit'; url: string } | { kind: 'fetch'; id: string };

@Injectable({ providedIn: 'root' })
export class AnalysisResourceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = () => environment.apiBaseUrl.replace(/\/$/, '');

  private readonly request = signal<AnalysisRequest | null>(null);

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      // err.error can be a string, object, ProgressEvent, etc.
      const body = err.error;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object' && 'error' in body && typeof (body as any).error === 'string') {
        return (body as any).error;
      }
      if (body && typeof body === 'object' && 'message' in body && typeof (body as any).message === 'string') {
        return (body as any).message;
      }
      return err.message || `Request failed (HTTP ${err.status})`;
    }

    if (err instanceof Error) return err.message;
    return typeof err === 'string' ? err : 'Request failed';
  }

  readonly analysis = resource({
    params: () => this.request() ?? undefined,
    loader: async ({ params }) => {
      try {
        const res =
          params.kind === 'submit'
            ? await firstValueFrom(this.http.post<JobResponse>(`${this.baseUrl()}/analysis`, { jobUrl: params.url }))
            : await firstValueFrom(this.http.get<JobResponse>(`${this.baseUrl()}/analysis/${params.id}`));

        if (res?.status === 'failed') {
          throw new Error(res.error ?? 'Analysis failed');
        }

        return res;
      } catch (err: unknown) {
        throw new Error(this.formatError(err));
      }
    },
  });

  readonly errorMessage = computed(() => {
    const err = this.analysis.error();
    if (!err) return null;
    return err instanceof Error ? err.message : this.formatError(err);
  });

  readonly result = computed<JobResult | null>(() => {
    if (!this.analysis.hasValue()) return null;
    return this.analysis.value().result ?? null;
  });

  readonly insights = computed(() => this.result()?.insights ?? null);
  readonly strategy = computed(() => this.result()?.strategy ?? null);
  readonly message = computed(() => this.result()?.message ?? null);
  readonly fallbacks = computed(() => this.result()?.fallbacks ?? []);

  /** True when the API returned at least one of job / insights / strategy / message to render. */
  readonly hasDisplayableAnalysis = computed(() => {
    const r = this.result();
    if (!r) return false;
    return !!(r.job || r.insights || r.strategy || r.message);
  });

  submitJob(url: string) {
    this.request.set({ kind: 'submit', url });
  }

  fetchJob(id: string) {
    this.request.set({ kind: 'fetch', id });
  }

  clear() {
    this.request.set(null);
  }
}