import { Component, inject, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { AnalysisResourceService } from '@web/app/services/analysis-resource.service';
import { StatusIndicator } from '@web/app/shared/components/status-indicator/status-indicator';
import type { JobResponse } from '@web/app/shared/type/job-response';
import { CopyClipboardStore } from '@web/app/store/copy-clipboard-store';

function decodeNumericEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_match, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

@Component({
  selector: 'dev-results',
  imports: [StatusIndicator],
  templateUrl: './results.html',
})
export class Results {
  analysis = inject(AnalysisResourceService);
  copyStore = inject(CopyClipboardStore);
  private readonly sanitizer = inject(DomSanitizer);

  copyToClipboard(message: JobResponse): void {
    const subject = decodeNumericEntities(message.subject ?? '');
    const body = decodeNumericEntities(message.body ?? '');
    const text = `Subject: ${subject}\n\n${body}`;
    this.copyStore.copyToClipboard(text);
  }

  protected sanitizedText(value: string | null | undefined): string {
    const raw = value ?? '';
    // CRITICAL: Decode HTML numeric entities BEFORE DomSanitizer.
    // This converts &#60;script&#62; to <script>, which DomSanitizer strips.
    // Reversing the order would let encoded XSS slip through as harmless text.
    const decoded = decodeNumericEntities(raw);
    return this.sanitizer.sanitize(SecurityContext.HTML, decoded) ?? '';
  }
}
