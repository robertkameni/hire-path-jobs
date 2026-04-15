import { Component, inject } from '@angular/core';
import { StatusIndicator } from '@web/app/shared/status-indicator';
import { AnalysisResourceService } from '@web/app/services/analysis-resource.service';

@Component({
  selector: 'dev-results',
  imports: [StatusIndicator],
  templateUrl: './results.html',
  styleUrls: ['./results.scss'],
})
export class Results {
  analysis = inject(AnalysisResourceService);

  getRiskClass(level: string | undefined): string {
    return level === 'High' ? 'text-[#ffab00]' : 'text-[#00c752]';
  }
}
