import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errMsg } from '../api';

@Component({
  imports: [FormsModule],
  template: `
    <div class="card narrow">
      <h2>Create event</h2>
      <form (ngSubmit)="submit()">
        <label>Name <input name="name" [ngModel]="name()" (ngModelChange)="name.set($event)" required /></label>
        <label>Date &amp; time <input name="date" type="datetime-local" [ngModel]="date()" (ngModelChange)="date.set($event)" required /></label>
        <label>Venue <input name="venue" [ngModel]="venue()" (ngModelChange)="venue.set($event)" required /></label>
        <div class="row">
          <label>Rows <input name="rows" type="number" min="1" max="50" [ngModel]="rows()" (ngModelChange)="rows.set($event)" required /></label>
          <label>Seats per row <input name="perRow" type="number" min="1" max="50" [ngModel]="perRow()" (ngModelChange)="perRow.set($event)" required /></label>
        </div>
        <p class="muted small">Total seats: {{ total() }}</p>
        <label>Description
          <textarea name="desc" rows="4" [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>
        </label>
        <div class="row">
          <button type="button" (click)="draft()" [disabled]="drafting() || !name() || !venue()">✨ Draft with AI</button>
          @if (draftSource()) { <span class="muted small">Source: {{ draftSource() }}</span> }
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="primary" type="submit" [disabled]="busy()">Create event</button>
      </form>
    </div>
  `,
})
export class EventFormPage {
  private api = inject(Api);
  private router = inject(Router);
  name = signal(''); venue = signal(''); description = signal('');
  date = signal(''); rows = signal(10); perRow = signal(12);
  error = signal(''); busy = signal(false); drafting = signal(false); draftSource = signal('');
  total = () => (Number(this.rows()) || 0) * (Number(this.perRow()) || 0);

  draft() {
    this.drafting.set(true);
    this.api.draftDescription({ name: this.name(), venue: this.venue(), date: this.date() ? new Date(this.date()).toISOString() : undefined }).subscribe({
      next: (r) => { this.description.set(r.description); this.draftSource.set(r.source === 'ai' ? 'Claude' : 'template (set ANTHROPIC_API_KEY for AI)'); this.drafting.set(false); },
      error: (e) => { this.error.set(errMsg(e)); this.drafting.set(false); },
    });
  }

  submit() {
    this.error.set('');
    if (!this.date() || new Date(this.date()).getTime() <= Date.now()) { this.error.set('Date must be in the future.'); return; }
    if (!(Number(this.rows()) >= 1) || !(Number(this.perRow()) >= 1)) { this.error.set('Seating grid must not be empty.'); return; }
    this.busy.set(true);
    this.api.createEvent({
      name: this.name(), venue: this.venue(), description: this.description(),
      date: new Date(this.date()).toISOString(), rows: Number(this.rows()), seatsPerRow: Number(this.perRow()),
    }).subscribe({
      next: (e) => { this.busy.set(false); this.router.navigate(['/events', e.id]); },
      error: (e) => { this.busy.set(false); this.error.set(errMsg(e)); },
    });
  }
}
