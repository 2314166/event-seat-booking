import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errMsg } from '../api';
import { Booking } from '../models';

@Component({
  imports: [DatePipe, RouterLink],
  template: `
    <h2>My bookings</h2>
    @if (error()) { <p class="error">{{ error() }}</p> }
    @if (bookings().length === 0) { <p class="muted">No bookings yet. <a routerLink="/events">Browse events</a></p> }
    <div class="grid">
      @for (b of bookings(); track b.id) {
        <div class="card">
          <div class="row between"><h3>{{ b.eventName }}</h3><span class="badge" [class]="b.status">{{ b.status }}</span></div>
          <p class="muted">{{ b.eventDate | date: 'EEE, d MMM y, h:mm a' }} · {{ b.venue }}</p>
          <p><strong>Seats:</strong> {{ b.seats.length ? b.seats.join(', ') : '—' }}</p>
          <p class="muted small">Booked {{ b.createdAt | date: 'd MMM y, h:mm a' }}</p>
          @if (b.status === 'confirmed') { <button (click)="cancel(b)">Cancel booking</button> }
          @if (b.status === 'held') {
            <a class="btn primary" [routerLink]="['/events', b.eventId]">Continue booking</a>
            <button (click)="cancel(b)">Release</button>
          }
        </div>
      }
    </div>
  `,
})
export class HistoryPage {
  private api = inject(Api);
  bookings = signal<Booking[]>([]);
  error = signal('');
  constructor() { this.load(); }
  load() { this.api.myBookings().subscribe((r) => this.bookings.set(r)); }
  cancel(b: Booking) {
    if (!confirm(`Cancel booking for ${b.seats.join(', ')}? The seats will be freed.`)) return;
    this.api.cancel(b.id).subscribe({ next: () => this.load(), error: (e) => this.error.set(errMsg(e)) });
  }
}
