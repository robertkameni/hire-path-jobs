import { Component, inject } from '@angular/core';
import { AnalysisStore } from '../../store/analysis.store';

@Component({
  selector: 'dev-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  private store = inject(AnalysisStore);

  async handleAnalyze(urlInput?: HTMLInputElement) {
    const url = typeof urlInput === 'string' ? urlInput : urlInput?.value;
    if (!url) return;
    try {
      await this.store.submitJob(url as string);
    } catch (err) {
      // errors are stored in the store; no-op here
      console.error('Analyze failed', err);
    }
  }
}
