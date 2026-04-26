import { Component, inject } from '@angular/core';
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

  copyToClipboard(message: JobResponse) {
    const text = `Subject: ${message.subject}\n\n${message.body}`;
    this.copyStore.copyToClipboard(text);
  }
}
