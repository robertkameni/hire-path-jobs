import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'dev-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './results.html',
  styleUrls: ['./results.scss'],
})
export class Results {
  isEmpty = signal(false);

  toggle() {
    this.isEmpty.set(!this.isEmpty());
  }
}
