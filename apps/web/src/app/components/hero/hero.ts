import { Component, inject } from '@angular/core';
import { AnalysisStore } from '../../store/analysis.store';

@Component({
  selector: 'dev-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  store = inject(AnalysisStore);

  async handleAnalyze(urlInput: HTMLInputElement) {
    const url = urlInput?.value.trim();
    if (!url) return;
    try {
      console.log('Sending URL to API:', url);
      await this.store.submitJob(url);
      urlInput.value = '';
    } catch (err) {
      console.error('Analyze failed', err);
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
