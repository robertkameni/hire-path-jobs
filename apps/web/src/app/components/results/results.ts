import { Component, inject } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { AnalysisStore } from '../../store/analysis.store';
import { StatusIndicator } from '../../shared/status-indicator';

@Component({
  selector: 'dev-results',
  imports: [NgClass, StatusIndicator],
  templateUrl: './results.html',
  styleUrls: ['./results.scss'],
})
export class Results {
  store = inject(AnalysisStore);

  getRiskClass(level: string | undefined): string {
    return level === 'High' ? 'text-[#ffab00]' : 'text-[#00c752]';
  }
}
