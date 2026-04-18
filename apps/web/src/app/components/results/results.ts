import { Component, inject } from '@angular/core';
import { AnalysisResourceService } from '@web/app/services/analysis-resource.service';
import { StatusIndicator } from '@web/app/shared/status-indicator';
import { CopyClipboardStore } from '@web/app/store/copy-clipboard-store';

@Component({
  selector: 'dev-results',
  imports: [StatusIndicator],
  templateUrl: './results.html',
})
export class Results {
  analysis = inject(AnalysisResourceService);
  copyStore = inject(CopyClipboardStore);

  copyToClipboard(text: string) {
    this.copyStore.copyToClipboard(text);
  }
}
