import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalysisStore } from '../../store/analysis.store';

@Component({
  selector: 'dev-results',
  imports: [CommonModule],
  templateUrl: './results.html',
  styleUrls: ['./results.scss'],
})
export class Results {
  private store = inject(AnalysisStore);

  isEmpty = computed(() => !this.store.result());

  toggle() {
    // keep the original toggle behavior for dev/testing
    if (this.isEmpty()) this.store.setResult({});
    else this.store.setResult(null);
  }
}
