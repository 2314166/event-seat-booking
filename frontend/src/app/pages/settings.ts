import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errMsg } from '../api';

@Component({
  imports: [FormsModule],
  template: `
    <div class="card narrow">
      <h2>Booking settings</h2>
      <p class="muted">Changes apply immediately to all new holds — no code change or restart needed.</p>
      <label>Seat hold duration (seconds)
        <input type="number" min="10" max="3600" [ngModel]="hold()" (ngModelChange)="hold.set($event)" />
      </label>
      <label>Maximum seats per booking
        <input type="number" min="1" max="20" [ngModel]="max()" (ngModelChange)="max.set($event)" />
      </label>
      @if (error()) { <p class="error">{{ error() }}</p> }
      @if (saved()) { <p class="ok">Saved.</p> }
      <button class="primary" (click)="save()">Save settings</button>
    </div>
  `,
})
export class SettingsPage {
  private api = inject(Api);
  hold = signal(300); max = signal(4);
  error = signal(''); saved = signal(false);
  constructor() { this.api.settings().subscribe((s) => { this.hold.set(s.holdDurationSeconds); this.max.set(s.maxSeatsPerBooking); }); }
  save() {
    this.error.set(''); this.saved.set(false);
    this.api.updateSettings({ holdDurationSeconds: Number(this.hold()), maxSeatsPerBooking: Number(this.max()) }).subscribe({
      next: () => this.saved.set(true), error: (e) => this.error.set(errMsg(e)),
    });
  }
}
