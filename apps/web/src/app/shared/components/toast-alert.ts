import { Component, inject } from '@angular/core';
import { CopyClipboardStore } from '@web/app/store/copy-clipboard-store';

@Component({
  selector: 'dev-toast-alert',
  template: `
    @if (copyStore.isCopied()) {
        <div
            class="fixed bottom-4 left-1/2 z-50 flex w-max max-w-sm -translate-x-1/2 items-center gap-2 rounded-lg border border-[#00c752]/35 bg-[#0a1a0d]/95 px-4 py-3 text-emerald-50 shadow-lg shadow-[#00c752]/10 backdrop-blur-sm"
            role="status"
            aria-live="polite"
        >
            <span class="text-[#00c752]" aria-hidden="true">✓</span>
            <p class="font-semibold text-sm">Copied to clipboard</p>
        </div>
        } @else if (copyStore.error()) {
        <div
            class="flex gap-3.5 fixed bottom-4 left-1/2 z-50 w-max max-w-sm -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-950/95 px-4 py-3 text-red-100 shadow-lg backdrop-blur-sm"
            role="status"
            aria-live="polite"
        >
            <p class="font-semibold text-sm">Failed to copy to clipboard</p>
            <span class="cursor-pointer text-red-600" aria-hidden="true" (click)="closeToaster()">❌</span>
        </div>
    }
    `,
})
export class ToastAlert {
  copyStore = inject(CopyClipboardStore);

  closeToaster() {
    this.copyStore.reset();
  }
}
