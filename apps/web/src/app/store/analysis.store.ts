import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { environment } from '../../environments/environment';

type AnalysisState = {
  loading: boolean;
  lastError: string | null;
  result: any | null;
};

const initialState: AnalysisState = {
  loading: false,
  lastError: null,
  result: null,
};

export const AnalysisStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const base = () => environment.apiBaseUrl.replace(/\/$/, '');

    return {
      setResult(result: any) {
        patchState(store, { result });
      },
      async submitJob(url: string) {
        const http = inject(HttpClient);
        patchState(store, { loading: true, lastError: null });
        try {
          const res = await firstValueFrom(http.post<any>(`${base()}/api/analysis`, { url }));
          patchState(store, { result: res ?? null });
          return res;
        } catch (err: any) {
          patchState(store, { lastError: err?.message ?? String(err) });
          throw err;
        } finally {
          patchState(store, { loading: false });
        }
      },

      async fetchJob(id: string) {
        const http = inject(HttpClient);
        patchState(store, { loading: true, lastError: null });
        try {
          const res = await firstValueFrom(http.get<any>(`${base()}/api/analysis/${id}`));
          patchState(store, { result: res ?? null });
          return res;
        } catch (err: any) {
          patchState(store, { lastError: err?.message ?? String(err) });
          throw err;
        } finally {
          patchState(store, { loading: false });
        }
      },
    };
  }),
);
