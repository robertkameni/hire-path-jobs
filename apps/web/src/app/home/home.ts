import { Component, inject } from '@angular/core';
import { Footer } from '../components/footer/footer';
import { Hero } from '../components/hero/hero';
import { LandingCopy } from '../components/landing-copy/landing-copy';
import { Navbar } from '../components/navbar/navbar';
import { Results } from '../components/results/results';
import { AnalysisResourceService } from '../services/analysis-resource.service';
import { ToastAlert } from '../shared/components/toast-alert';

@Component({
  selector: 'dev-home',
  imports: [Navbar, Hero, LandingCopy, Results, Footer, ToastAlert],
  templateUrl: './home.html',
})
export class Home {
  protected readonly analysis = inject(AnalysisResourceService);
}
