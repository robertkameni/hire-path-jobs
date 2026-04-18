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
          patchState(store, { copiedToClipboard: true });
        })
        .catch((err) => {
          patchState(store, { error: err.message });
        });
    },
  })),
  withComputed(({ copiedToClipboard }) => ({
    isCopied: computed(() => copiedToClipboard()),
  })),
);
