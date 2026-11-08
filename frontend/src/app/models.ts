export type Role = 'attendee' | 'organizer';
export interface User { id: number; email: string; name: string; role: Role }
export interface AuthResult { token: string; user: User }
export interface EventItem {
  id: number; name: string; date: string; venue: string; description: string;
  rows: number; seatsPerRow: number; totalSeats: number; takenSeats?: number;
}
export type SeatStatus = 'available' | 'held' | 'booked';
export interface Seat {
  id: number; row: number; number: number; label: string; status: SeatStatus;
  mine: boolean; bookingId?: number; holdExpiresAt?: string;
}
export interface Booking {
  id: number; eventId: number; eventName: string; eventDate: string; venue: string;
  status: 'held' | 'confirmed' | 'cancelled' | 'expired';
  seats: string[]; seatIds: number[]; holdExpiresAt: string | null;
  createdAt: string; confirmedAt: string | null; cancelledAt: string | null;
}
export interface Settings { holdDurationSeconds: number; maxSeatsPerBooking: number }
