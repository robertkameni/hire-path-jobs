import { Component, inject } from '@angular/core';
import { AnalysisResourceService } from '@web/app/services/analysis-resource.service';
import { StatusIndicator } from '@web/app/shared/status-indicator';

@Component({
  selector: 'dev-results',
  imports: [StatusIndicator],
  templateUrl: './results.html',
})
export class Results {
  analysis = inject(AnalysisResourceService);
}
