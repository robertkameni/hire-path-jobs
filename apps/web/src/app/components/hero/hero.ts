import { Component, inject, signal } from '@angular/core';
import { AnalysisResourceService } from '../../services/analysis-resource.service';

@Component({
  selector: 'dev-hero',
  imports: [],
  templateUrl: './hero.html',
})
export class Hero {
  analysis = inject(AnalysisResourceService);
  jobUrl = signal('');
  jobText = signal('');
  isJobTextOpen = signal(false);

  async handleAnalyze() {
    const url = this.jobUrl().trim();
    const text = this.jobText().trim();

    if (!url && !text) return;

    await this.analysis.submitJob(url, text);

    this.jobUrl.set('');
    this.jobText.set('');
    this.isJobTextOpen.set(false);
  }

  onToggle(event: Event) {
    const open = (event.target as HTMLDetailsElement).open;

    if (this.isJobTextOpen() !== open) {
      this.isJobTextOpen.set(open);
    }
  }
}
