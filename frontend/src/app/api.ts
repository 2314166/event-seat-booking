import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Booking, EventItem, Seat, Settings } from './models';

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  events() { return this.http.get<EventItem[]>('/api/events'); }
  event(id: number) { return this.http.get<EventItem>(`/api/events/${id}`); }
  seats(id: number) { return this.http.get<Seat[]>(`/api/events/${id}/seats`); }
  createEvent(body: { name: string; date: string; venue: string; description?: string; rows: number; seatsPerRow: number }) {
    return this.http.post<EventItem>('/api/events', body);
  }
  changeSeating(id: number, rows: number, seatsPerRow: number) {
    return this.http.put<EventItem>(`/api/events/${id}/seating`, { rows, seatsPerRow });
  }
  draftDescription(body: { name: string; venue: string; date?: string; keywords?: string }) {
    return this.http.post<{ description: string; source: 'ai' | 'template' }>('/api/events/ai-description', body);
  }
  hold(eventId: number, seatIds: number[]) { return this.http.post<Booking>(`/api/events/${eventId}/holds`, { seatIds }); }
  confirm(bookingId: number) { return this.http.post<Booking>(`/api/bookings/${bookingId}/confirm`, {}); }
  cancel(bookingId: number) { return this.http.delete<Booking>(`/api/bookings/${bookingId}`); }
  myBookings() { return this.http.get<Booking[]>('/api/bookings/mine'); }
  settings() { return this.http.get<Settings>('/api/settings'); }
  updateSettings(s: Partial<Settings>) { return this.http.put<Settings>('/api/settings', s); }
}

export function errMsg(e: any): string {
  const m = e?.error?.message;
  if (Array.isArray(m)) return m.join(', ');
  return m || e?.message || 'Something went wrong';
}
