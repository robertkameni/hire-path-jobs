import { NgClass } from "@angular/common";
import { Component, input } from "@angular/core";

interface Status {
  state: 'idle' | 'loading' | 'success' | 'error';
}

@Component({
  selector: "dev-status-indicator",
  templateUrl:"./status-indicator.html",
  imports:[NgClass]
})
export class StatusIndicator {
  statusState = input<Status>({ state: 'idle' });
}