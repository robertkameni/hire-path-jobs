import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CopyClipboardStore } from './store/copy-clipboard-store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('web');
  copyStore = inject(CopyClipboardStore);
}
