import { Component, inject, signal } from '@angular/core';
import { Footer } from './components/footer/footer';
import { Hero } from './components/hero/hero';
import { Navbar } from './components/navbar/navbar';
import { Results } from './components/results/results';
import { ToastAlert } from './shared/components/toast-alert';
import { CopyClipboardStore } from './store/copy-clipboard-store';

@Component({
  selector: 'app-root',
  imports: [Navbar, Hero, Results, Footer, ToastAlert],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('web');
  copyStore = inject(CopyClipboardStore);
}
