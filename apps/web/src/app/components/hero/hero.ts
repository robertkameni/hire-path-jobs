import { Component } from '@angular/core';

@Component({
  selector: 'dev-hero',
  imports: [],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  handleAnalyze() {
    console.log('Analyze clicked');
  }
}
