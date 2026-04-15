import { Component, inject, signal } from '@angular/core';
import { AnalysisResourceService } from '../../services/analysis-resource.service';

@Component({
  selector: 'dev-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  analysis = inject(AnalysisResourceService);
  jobUrl = signal('');

  async handleAnalyze() {
    const url = this.jobUrl().trim();
    if (!url) return;
    try {
      this.analysis.submitJob(url);
      this.jobUrl.set('');
    } catch (err) {
      console.error('Analyze failed', err);
    }
  }
}
