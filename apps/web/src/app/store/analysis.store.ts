import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { JobResult, JobResponse } from '@hire-path-jobs/shared-types';
import { environment } from '../../environments/environment';

type AnalysisState = {
  loading: boolean;
  lastError: string | null;
  result: JobResult | null;
};

const initialState: AnalysisState = {
  loading: false,
  lastError: null,
  result: null,
};

export const AnalysisStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, http = inject(HttpClient)) => {
    const base = () => environment.apiBaseUrl.replace(/\/$/, '');

    return {
      setResult(result: JobResult) {
        patchState(store, { result });
      },
      async submitJob(url: string) {
        patchState(store, { loading: true, lastError: null });
        try {
          const res = await firstValueFrom(http.post<JobResponse>(`${base()}/analysis`, { jobUrl: url }));
          if (res?.status === 'failed' && res.error) {
            patchState(store, { result: null, lastError: res.error });
          } else {
            patchState(store, { result: res?.result ?? null });
          }
          return res;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          patchState(store, { lastError: message });
          throw err;
        } finally {
          patchState(store, { loading: false });
        }
      },

      async fetchJob(id: string) {
        patchState(store, { loading: true, lastError: null });
        try {
          const res = await firstValueFrom(http.get<JobResponse>(`${base()}/analysis/${id}`));
          if (res?.status === 'failed' && res.error) {
            patchState(store, { result: null, lastError: res.error });
          } else {
            patchState(store, { result: res?.result ?? null });
          }
          return res;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          patchState(store, { lastError: message });
          throw err;
        } finally {
          patchState(store, { loading: false });
        }
      },
    };
  }),
);
