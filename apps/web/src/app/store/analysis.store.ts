import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { JobResult, JobResponse } from '@hire-path-jobs/shared-types';
import { environment } from '../../environments/environment';

type StatusState = 'idle' | 'loading' | 'success' | 'error';
type Status = { state: StatusState };

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
  withComputed((store) => {
    const statusState = computed<StatusState>(() => {
      if (store.loading()) return 'loading';
      if (store.lastError()) return 'error';
      if (store.result()) return 'success';
      return 'idle';
    });

    const status = computed<Status>(() => ({ state: statusState() }));
    const hasResult = computed(() => !!store.result() && !store.loading() && !store.lastError());

    return {
      statusState,
      status,
      hasResult,
      insights: computed(() => store.result()?.insights ?? null),
      strategy: computed(() => store.result()?.strategy ?? null),
      message: computed(() => store.result()?.message ?? null),
    };
  }),
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
