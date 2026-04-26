import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

type CopyClipboardState = {
  copiedToClipboard: boolean;
  error: string | null;
};

const initialState: CopyClipboardState = {
  copiedToClipboard: false,
  error: null,
};

export const CopyClipboardStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    copyToClipboard: (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          patchState(store, { copiedToClipboard: true, error: null });
          setTimeout(() => patchState(store, { copiedToClipboard: false }), 5000);
        })
        .catch((err) => {
          patchState(store, { error: err.message, copiedToClipboard: false });
        });
    },
    reset: () => {
      patchState(store, initialState);
    },
  })),
  withComputed(({ copiedToClipboard }) => ({
    isCopied: computed(() => copiedToClipboard()),
  })),
);
