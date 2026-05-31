import { Component, inject, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { AnalysisResourceService } from '@web/app/services/analysis-resource.service';
import { StatusIndicator } from '@web/app/shared/components/status-indicator/status-indicator';
import type { JobResponse } from '@web/app/shared/type/job-response';
import { CopyClipboardStore } from '@web/app/store/copy-clipboard-store';

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
    const text = `Subject: ${message.subject}\n\n${message.body}`;
    this.copyStore.copyToClipboard(text);
  }

  protected sanitizedText(value: string | null | undefined): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, value ?? '') ?? '';
  }
}
