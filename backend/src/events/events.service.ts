import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { Clock } from '../common/clock';

export interface EventInput { name: string; date: string; venue: string; description?: string; rows: number; seatsPerRow: number }

function rowLabel(i: number): string { // 1->A ... 26->Z, 27->AA
  let s = ''; let n = i;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

@Injectable()
export class EventsService {
  constructor(private db: DbService, private clock: Clock) {}

  private validate(i: EventInput) {
    const d = new Date(i.date);
    if (isNaN(d.getTime())) throw new BadRequestException('Invalid date');
    if (d.getTime() <= this.clock.now().getTime()) throw new BadRequestException('Event date must be in the future');
    if (!i.rows || !i.seatsPerRow || i.rows < 1 || i.seatsPerRow < 1) throw new BadRequestException('Seating grid must not be empty');
  }

  private async createSeats(c: PoolClient, eventId: number, rows: number, perRow: number) {
    const values: string[] = []; const params: any[] = [eventId];
    for (let r = 1; r <= rows; r++) for (let s = 1; s <= perRow; s++) {
      params.push(r, s, `${rowLabel(r)}${s}`);
      const k = params.length;
      values.push(`($1,$${k - 2},$${k - 1},$${k})`);
    }
    await c.query(`INSERT INTO seats(event_id,row_no,seat_no,label) VALUES ${values.join(',')}`, params);
  }

  async create(i: EventInput, userId: number) {
    this.validate(i);
    return this.db.tx(async (c) => {
      const r = await c.query(
        'INSERT INTO events(name,date,venue,description,seat_rows,seats_per_row,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [i.name, i.date, i.venue, i.description ?? '', i.rows, i.seatsPerRow, userId],
      );
      await this.createSeats(c, r.rows[0].id, i.rows, i.seatsPerRow);
      return this.get(r.rows[0].id, c);
    });
  }

  async update(id: number, p: Partial<Pick<EventInput, 'name' | 'date' | 'venue' | 'description'>>) {
    const cur = await this.get(id);
    const next = { ...cur, ...p } as any;
    if (p.date) {
      const d = new Date(p.date);
      if (isNaN(d.getTime()) || d.getTime() <= this.clock.now().getTime()) throw new BadRequestException('Event date must be in the future');
    }
    await this.db.query('UPDATE events SET name=$2,date=$3,venue=$4,description=$5 WHERE id=$1',
      [id, next.name, next.date, next.venue, next.description ?? '']);
    return this.get(id);
  }

  /** Reshape seating grid. Refused while any seat has an active claim, so nobody loses a booked seat. */
  async changeSeating(id: number, rows: number, seatsPerRow: number) {
    if (!rows || !seatsPerRow || rows < 1 || seatsPerRow < 1) throw new BadRequestException('Seating grid must not be empty');
    return this.db.tx(async (c) => {
      await c.query('SELECT id FROM events WHERE id=$1 FOR UPDATE', [id]);
      const active = await c.query(
        `SELECT 1 FROM booking_seats bs JOIN seats s ON s.id=bs.seat_id
         JOIN bookings b ON b.id=bs.booking_id
         WHERE s.event_id=$1 AND bs.active AND (b.status='confirmed' OR b.hold_expires_at > $2) LIMIT 1`,
        [id, this.clock.now()],
      );
      if (active.rowCount) throw new ConflictException('Cannot change seating while seats are booked or held');
      await c.query('DELETE FROM seats WHERE event_id=$1', [id]);
      await c.query('UPDATE events SET seat_rows=$2, seats_per_row=$3 WHERE id=$1', [id, rows, seatsPerRow]);
      await this.createSeats(c, id, rows, seatsPerRow);
      return this.get(id, c);
    });
  }

  async get(id: number, c?: PoolClient) {
    const q: { query(t: string, p?: any[]): Promise<any> } = c ?? this.db;
    const r = await q.query(
      `SELECT e.*, (e.seat_rows*e.seats_per_row) AS total_seats FROM events e WHERE e.id=$1`, [id]);
    if (!r.rowCount) throw new NotFoundException('Event not found');
    return this.map(r.rows[0]);
  }

  async list() {
    const r = await this.db.query(
      `SELECT e.*, (e.seat_rows*e.seats_per_row) AS total_seats,
        (SELECT count(*) FROM booking_seats bs JOIN seats s ON s.id=bs.seat_id JOIN bookings b ON b.id=bs.booking_id
          WHERE s.event_id=e.id AND bs.active AND (b.status='confirmed' OR b.hold_expires_at > $1)) AS taken
       FROM events e ORDER BY e.date ASC`, [this.clock.now()]);
    return r.rows.map((x) => ({ ...this.map(x), takenSeats: Number(x.taken) }));
  }

  private map(x: any) {
    return {
      id: x.id, name: x.name, date: x.date, venue: x.venue, description: x.description,
      rows: x.seat_rows, seatsPerRow: x.seats_per_row, totalSeats: Number(x.total_seats),
    };
  }

  /** Seat map: available / held (unexpired hold) / booked (confirmed). Mine=true flags the caller's own claims. */
  async seatMap(eventId: number, userId: number) {
    await this.get(eventId);
    const r = await this.db.query(
      `SELECT s.id, s.row_no, s.seat_no, s.label, b.status, b.hold_expires_at, b.user_id, b.id AS booking_id
       FROM seats s
       LEFT JOIN booking_seats bs ON bs.seat_id=s.id AND bs.active
       LEFT JOIN bookings b ON b.id=bs.booking_id
       WHERE s.event_id=$1 ORDER BY s.row_no, s.seat_no`, [eventId]);
    const now = this.clock.now().getTime();
    return r.rows.map((x) => {
      let status: 'available' | 'held' | 'booked' = 'available';
      if (x.status === 'confirmed') status = 'booked';
      else if (x.status === 'held' && new Date(x.hold_expires_at).getTime() > now) status = 'held';
      const mine = status !== 'available' && x.user_id === userId;
      return { id: x.id, row: x.row_no, number: x.seat_no, label: x.label, status, mine,
        bookingId: mine ? x.booking_id : undefined,
        holdExpiresAt: status === 'held' && mine ? x.hold_expires_at : undefined };
    });
  }
}
