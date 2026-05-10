import { Component } from '@angular/core';
import { Footer } from '../components/footer/footer';
import { Hero } from '../components/hero/hero';
import { Navbar } from '../components/navbar/navbar';
import { Results } from '../components/results/results';
import { ToastAlert } from '../shared/components/toast-alert';

@Component({
  selector: 'dev-home',
  imports: [Navbar, Hero, Results, Footer, ToastAlert],
  templateUrl: './home.html',
})
export class Home {}
