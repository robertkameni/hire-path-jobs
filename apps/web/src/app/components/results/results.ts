import { Component, inject } from '@angular/core';
import { AnalysisResourceService } from '@web/app/services/analysis-resource.service';
import { StatusIndicator } from '@web/app/shared/status-indicator';

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
