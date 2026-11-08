import { DatePipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errMsg } from '../api';
import { AuthService } from '../auth';
import { Booking, EventItem, Seat, Settings } from '../models';

@Component({
  imports: [DatePipe, FormsModule, RouterLink],
  template: `
    <a routerLink="/events" class="muted">← All events</a>
    @if (event(); as ev) {
      <h2>{{ ev.name }}</h2>
      <p class="muted">{{ ev.date | date: 'EEE, d MMM y, h:mm a' }} · {{ ev.venue }}</p>

      <div class="legend">
        <span><i class="seat available"></i> Available</span>
        <span><i class="seat selected"></i> Selected</span>
        <span><i class="seat held"></i> Held</span>
        <span><i class="seat booked"></i> Booked</span>
        <span><i class="seat held mine"></i> Yours</span>
        <span class="muted small">Live: refreshes every 3s</span>
      </div>

      <div class="stage">STAGE / SCREEN</div>
      <div class="map">
        @for (row of rows(); track row.no) {
          <div class="maprow">
            <span class="rowlabel">{{ row.label }}</span>
            @for (s of row.seats; track s.id) {
              <button type="button" class="seat" [class]="seatClass(s)" [disabled]="!canClick(s)" (click)="toggle(s)" [title]="s.label + ' · ' + s.status">{{ s.number }}</button>
            }
          </div>
        }
      </div>

      @if (auth.isAttendee()) {
        <div class="card panel">
          @if (activeHold(); as h) {
            <h3>Seats held: {{ h.seats.join(', ') }}</h3>
            <p>Complete your booking in <strong class="countdown" [class.low]="remaining() <= 30">{{ mmss() }}</strong></p>
            <div class="row">
              <button class="primary" (click)="confirm(h)" [disabled]="busy()">Confirm booking</button>
              <button (click)="release(h)" [disabled]="busy()">Release seats</button>
            </div>
          } @else {
            <h3>Your selection</h3>
            @if (selected().length === 0) { <p class="muted">Click available seats to select up to {{ settings()?.maxSeatsPerBooking ?? 4 }}.</p> }
            @else { <p>{{ selectedLabels() }} ({{ selected().length }}/{{ settings()?.maxSeatsPerBooking ?? 4 }})</p> }
            <p class="muted small">Seats are held for {{ holdMinutes() }} while you confirm.</p>
            <button class="primary" (click)="holdSeats()" [disabled]="busy() || selected().length === 0">Hold selected seats</button>
          }
          @if (message()) { <p class="ok">{{ message() }}</p> }
          @if (error()) { <p class="error">{{ error() }}</p> }
        </div>
      }

      @if (auth.isOrganizer()) {
        <div class="card panel">
          <h3>Change seating (organizer)</h3>
          <p class="muted small">Current grid: {{ ev.rows }} rows × {{ ev.seatsPerRow }} seats. Only allowed while no seats are held or booked.</p>
          <div class="row">
            <label>Rows <input type="number" min="1" max="50" [ngModel]="newRows()" (ngModelChange)="newRows.set($event)" /></label>
            <label>Seats / row <input type="number" min="1" max="50" [ngModel]="newPerRow()" (ngModelChange)="newPerRow.set($event)" /></label>
            <button class="primary" (click)="applySeating()">Apply</button>
          </div>
          @if (message()) { <p class="ok">{{ message() }}</p> }
          @if (error()) { <p class="error">{{ error() }}</p> }
        </div>
      }
    }
  `,
})
export class EventDetailPage implements OnDestroy {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  auth = inject(AuthService);

  private eventId = Number(this.route.snapshot.paramMap.get('id'));
  event = signal<EventItem | null>(null);
  seats = signal<Seat[]>([]);
  settings = signal<Settings | null>(null);
  selected = signal<number[]>([]);
  hold = signal<Booking | null>(null);
  now = signal(Date.now());
  busy = signal(false);
  error = signal(''); message = signal('');
  newRows = signal(10); newPerRow = signal(12);

  private poll = setInterval(() => this.loadSeats(), 3000);
  private tick = setInterval(() => this.now.set(Date.now()), 1000);

  rows = computed(() => {
    const byRow = new Map<number, Seat[]>();
    for (const s of this.seats()) byRow.set(s.row, [...(byRow.get(s.row) ?? []), s]);
    return [...byRow.entries()].map(([no, seats]) => ({ no, label: seats[0].label.replace(/\d+$/, ''), seats }));
  });

  /** The active hold is rebuilt from the seat map too, so a page refresh does not lose it. */
  activeHold = computed(() => {
    const h = this.hold();
    if (h && h.holdExpiresAt && new Date(h.holdExpiresAt).getTime() > this.now()) return h;
    return null;
  });
  remaining = computed(() => {
    const h = this.activeHold();
    return h?.holdExpiresAt ? Math.max(0, Math.floor((new Date(h.holdExpiresAt).getTime() - this.now()) / 1000)) : 0;
  });
  mmss = computed(() => `${Math.floor(this.remaining() / 60)}:${String(this.remaining() % 60).padStart(2, '0')}`);
  selectedLabels = computed(() => this.seats().filter((s) => this.selected().includes(s.id)).map((s) => s.label).join(', '));
  holdMinutes = computed(() => {
    const sec = this.settings()?.holdDurationSeconds ?? 300;
    return sec % 60 === 0 ? `${sec / 60} min` : `${sec} sec`;
  });

  constructor() {
    this.api.event(this.eventId).subscribe((e) => { this.event.set(e); this.newRows.set(e.rows); this.newPerRow.set(e.seatsPerRow); });
    this.api.settings().subscribe((s) => this.settings.set(s));
    this.loadSeats();
  }

  ngOnDestroy() { clearInterval(this.poll); clearInterval(this.tick); }

  loadSeats() {
    this.api.seats(this.eventId).subscribe({
      next: (seats) => {
        this.seats.set(seats);
        // drop selections that someone else just took
        this.selected.update((sel) => sel.filter((id) => seats.find((s) => s.id === id)?.status === 'available'));
        // recover my own un-confirmed hold (e.g. after a page refresh)
        if (this.auth.isAttendee() && !this.hold()) {
          const mine = seats.filter((s) => s.mine && s.status === 'held');
          if (mine.length && mine[0].bookingId) {
            this.hold.set({ id: mine[0].bookingId, seats: mine.map((s) => s.label), holdExpiresAt: mine[0].holdExpiresAt ?? null } as Booking);
          }
        }
        const h = this.hold();
        if (h && !seats.some((s) => s.mine && s.status === 'held' && s.bookingId === h.id)) {
          if (!this.busy()) this.hold.set(null); // expired or released elsewhere
        }
      },
      error: () => undefined,
    });
  }

  seatClass(s: Seat) {
    if (this.selected().includes(s.id)) return 'seat selected';
    return `seat ${s.status}${s.mine ? ' mine' : ''}`;
  }
  canClick(s: Seat) { return this.auth.isAttendee() && !this.activeHold() && s.status === 'available'; }

  toggle(s: Seat) {
    this.error.set(''); this.message.set('');
    const max = this.settings()?.maxSeatsPerBooking ?? 4;
    this.selected.update((sel) => {
      if (sel.includes(s.id)) return sel.filter((x) => x !== s.id);
      if (sel.length >= max) { this.error.set(`You can select at most ${max} seats.`); return sel; }
      return [...sel, s.id];
    });
  }

  holdSeats() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.hold(this.eventId, this.selected()).subscribe({
      next: (b) => { this.busy.set(false); this.hold.set(b); this.selected.set([]); this.loadSeats(); },
      error: (e) => { this.busy.set(false); this.error.set(errMsg(e)); this.selected.set([]); this.loadSeats(); },
    });
  }

  confirm(h: Booking) {
    this.busy.set(true); this.error.set('');
    this.api.confirm(h.id).subscribe({
      next: () => { this.busy.set(false); this.hold.set(null); this.router.navigateByUrl('/history'); },
      error: (e) => { this.busy.set(false); this.hold.set(null); this.error.set(errMsg(e)); this.loadSeats(); },
    });
  }

  release(h: Booking) {
    this.busy.set(true);
    this.api.cancel(h.id).subscribe({
      next: () => { this.busy.set(false); this.hold.set(null); this.message.set('Seats released.'); this.loadSeats(); },
      error: (e) => { this.busy.set(false); this.error.set(errMsg(e)); },
    });
  }

  applySeating() {
    this.error.set(''); this.message.set('');
    this.api.changeSeating(this.eventId, Number(this.newRows()), Number(this.newPerRow())).subscribe({
      next: (e) => { this.event.set(e); this.message.set('Seating updated.'); this.loadSeats(); },
      error: (e) => this.error.set(errMsg(e)),
    });
  }
}
