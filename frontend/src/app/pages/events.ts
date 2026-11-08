import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../api';
import { AuthService } from '../auth';
import { EventItem } from '../models';

@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="row between">
      <h2>Upcoming events</h2>
      @if (auth.isOrganizer()) { <a class="btn primary" routerLink="/organizer/events/new">+ New event</a> }
    </div>
    @if (events().length === 0) { <p class="muted">No events yet.</p> }
    <div class="grid">
      @for (e of events(); track e.id) {
        <div class="card">
          <h3>{{ e.name }}</h3>
          <p class="muted">{{ e.date | date: 'EEE, d MMM y, h:mm a' }} · {{ e.venue }}</p>
          <p>{{ e.description }}</p>
          <div class="bar"><div class="fill" [style.width.%]="pct(e)"></div></div>
          <p class="muted small">{{ e.takenSeats ?? 0 }} / {{ e.totalSeats }} seats taken</p>
          <a class="btn primary" [routerLink]="['/events', e.id]">{{ auth.isOrganizer() ? 'Manage / view seats' : 'Select seats' }}</a>
        </div>
      }
    </div>
  `,
})
export class EventsPage {
  private api = inject(Api);
  auth = inject(AuthService);
  events = signal<EventItem[]>([]);
  constructor() { this.api.events().subscribe((r) => this.events.set(r)); }
  pct(e: EventItem) { return e.totalSeats ? ((e.takenSeats ?? 0) / e.totalSeats) * 100 : 0; }
}
