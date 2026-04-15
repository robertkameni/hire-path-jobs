import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, resource, signal } from '@angular/core';
import { JobResponse, JobResult } from '@hire-path-jobs/shared-types';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { formatError } from '../shared/utils/format-error.utils';

type AnalysisRequest = { url: string };

@Injectable({ providedIn: 'root' })
export class AnalysisResourceService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = () => environment.apiBaseUrl.replace(/\/$/, '');

  private readonly request = signal<AnalysisRequest | null>(null);

  readonly analysis = resource({
    params: () => this.request() ?? undefined,
    loader: async ({ params }) => {
      try {
        const res = await firstValueFrom(
          this.http.post<JobResponse>(`${this.baseUrl()}/analysis`, { jobUrl: params.url }),
        );

        if (res?.status === 'failed') {
          throw new Error(res.error ?? 'Analysis failed');
        }

        return res;
      } catch (err: unknown) {
        throw new Error(formatError(err));
      }
    },
  });

  readonly errorMessage = computed(() => {
    const err = this.analysis.error();
    if (!err) return null;
    return err instanceof Error ? err.message : formatError(err);
  });

  readonly result = computed<JobResult | null>(() => {
    if (!this.analysis.hasValue()) return null;
    return this.analysis.value().result ?? null;
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

  submitJob(url: string) {
    this.request.set({ url });
  }

  clear() {
    this.request.set(null);
  }
}