import { Component, signal } from '@angular/core';
import { Footer } from './components/footer/footer';
import { Hero } from './components/hero/hero';
import { Navbar } from './components/navbar/navbar';
import { Results } from './components/results/results';

@Component({
  selector: 'app-root',
  imports: [Navbar, Hero, Results, Footer],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('web');
}
