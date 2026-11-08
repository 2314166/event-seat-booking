import {
  BadRequestException, ConflictException, ForbiddenException, GoneException,
  Injectable, NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { Clock } from '../common/clock';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private db: DbService, private clock: Clock, private settings: SettingsService) {}

  /** Background sweeper: releases expired holds automatically (disabled in tests via DISABLE_SWEEPER). */
  onModuleInit() {
    if (process.env.DISABLE_SWEEPER === '1') return;
    this.timer = setInterval(() => this.releaseExpired().catch(() => undefined), 5000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Frees seats of every held booking whose hold_expires_at <= now(clock). Returns number released. */
  async releaseExpired(c?: PoolClient, seatIds?: number[]): Promise<number> {
    const run = async (q: PoolClient) => {
      const r = await q.query(
        `UPDATE bookings SET status='expired'
         WHERE status='held' AND hold_expires_at <= $1
           AND ($2::int[] IS NULL OR id IN (SELECT booking_id FROM booking_seats WHERE seat_id = ANY($2) AND active))
         RETURNING id`,
        [this.clock.now(), seatIds ?? null],
      );
      if (r.rowCount) {
        await q.query('UPDATE booking_seats SET active=false WHERE active AND booking_id = ANY($1)', [r.rows.map((x) => x.id)]);
      }
      return r.rowCount ?? 0;
    };
    return c ? run(c) : this.db.tx(run);
  }

  async createHold(userId: number, eventId: number, rawSeatIds: number[]) {
    const seatIds = [...new Set(rawSeatIds)].sort((a, b) => a - b); // sorted => consistent lock order, no deadlocks
    if (!seatIds.length) throw new BadRequestException('Select at least one seat');
    try {
      return await this.db.tx(async (c) => {
        const cfg = await this.settings.get(c);
        if (seatIds.length > cfg.maxSeatsPerBooking) {
          throw new BadRequestException(`You can book at most ${cfg.maxSeatsPerBooking} seats at a time`);
        }
        const ev = await c.query('SELECT id, date FROM events WHERE id=$1', [eventId]);
        if (!ev.rowCount) throw new NotFoundException('Event not found');
        const now = this.clock.now();
        if (new Date(ev.rows[0].date).getTime() <= now.getTime()) throw new BadRequestException('Event has already started');

        const valid = await c.query('SELECT id FROM seats WHERE event_id=$1 AND id = ANY($2)', [eventId, seatIds]);
        if (valid.rowCount !== seatIds.length) throw new BadRequestException('Unknown seat for this event');

        // replace this user's previous un-confirmed hold for the event (they re-picked seats)
        await c.query(
          `DELETE FROM bookings WHERE user_id=$1 AND event_id=$2 AND status='held'`, [userId, eventId]);
        // free any expired holds sitting on the requested seats so they can be re-claimed
        await this.releaseExpired(c, seatIds);

        const expires = new Date(now.getTime() + cfg.holdDurationSeconds * 1000);
        const b = await c.query(
          `INSERT INTO bookings(event_id,user_id,status,hold_expires_at,created_at) VALUES($1,$2,'held',$3,$4) RETURNING id`,
          [eventId, userId, expires, now]);
        const bookingId = b.rows[0].id;
        // Storage-level guard: the partial unique index uq_booking_seats_one_active_per_seat rejects a 2nd active claim.
        await c.query(
          `INSERT INTO booking_seats(booking_id, seat_id, active) SELECT $1, unnest($2::int[]), true`,
          [bookingId, seatIds]);
        return this.getOne(bookingId, c);
      });
    } catch (e: any) {
      if (e?.code === '23505' || e?.code === '40P01' || e?.code === '40001') {
        throw new ConflictException('One or more of those seats were just taken. Please pick other seats.');
      }
      throw e;
    }
  }

  async confirm(userId: number, bookingId: number) {
    const outcome = await this.db.tx(async (c) => {
      const r = await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
      const b = r.rows[0];
      if (!b) throw new NotFoundException('Booking not found');
      if (b.user_id !== userId) throw new ForbiddenException('Not your booking');
      if (b.status !== 'held') throw new ConflictException(`Booking is already ${b.status}`);
      const now = this.clock.now();
      if (new Date(b.hold_expires_at).getTime() <= now.getTime()) {
        await c.query(`UPDATE bookings SET status='expired' WHERE id=$1`, [bookingId]);
        await c.query('UPDATE booking_seats SET active=false WHERE booking_id=$1', [bookingId]);
        return 'expired' as const;
      }
      await c.query(`UPDATE bookings SET status='confirmed', confirmed_at=$2, hold_expires_at=NULL WHERE id=$1`, [bookingId, now]);
      return 'ok' as const;
    });
    if (outcome === 'expired') throw new GoneException('Your hold expired. Please select seats again.');
    return this.getOne(bookingId);
  }

  async cancel(userId: number, bookingId: number, isOrganizer = false) {
    await this.db.tx(async (c) => {
      const r = await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId]);
      const b = r.rows[0];
      if (!b) throw new NotFoundException('Booking not found');
      if (b.user_id !== userId && !isOrganizer) throw new ForbiddenException('Not your booking');
      if (b.status !== 'held' && b.status !== 'confirmed') throw new ConflictException(`Booking is already ${b.status}`);
      await c.query(`UPDATE bookings SET status='cancelled', cancelled_at=$2 WHERE id=$1`, [bookingId, this.clock.now()]);
      await c.query('UPDATE booking_seats SET active=false WHERE booking_id=$1', [bookingId]); // frees the seats
    });
    return this.getOne(bookingId);
  }

  async getOne(id: number, c?: PoolClient) {
    const q: { query(t: string, p?: any[]): Promise<any> } = c ?? this.db;
    const r = await q.query(this.baseSelect('WHERE b.id=$1'), [id]);
    if (!r.rowCount) throw new NotFoundException('Booking not found');
    return this.map(r.rows[0]);
  }

  async history(userId: number) {
    const r = await this.db.query(this.baseSelect('WHERE b.user_id=$1') + ' ORDER BY b.created_at DESC, b.id DESC', [userId]);
    return r.rows.map((x) => this.map(x));
  }

  private baseSelect(where: string) {
    return `SELECT b.*, e.name AS event_name, e.date AS event_date, e.venue AS event_venue,
              COALESCE((SELECT json_agg(s.label ORDER BY s.row_no, s.seat_no) FROM booking_seats bs JOIN seats s ON s.id=bs.seat_id WHERE bs.booking_id=b.id),'[]'::json) AS seat_labels,
              COALESCE((SELECT json_agg(s.id ORDER BY s.row_no, s.seat_no) FROM booking_seats bs JOIN seats s ON s.id=bs.seat_id WHERE bs.booking_id=b.id),'[]'::json) AS seat_ids
            FROM bookings b JOIN events e ON e.id=b.event_id ${where}`;
  }

  private map(x: any) {
    let status = x.status;
    if (status === 'held' && new Date(x.hold_expires_at).getTime() <= this.clock.now().getTime()) status = 'expired';
    return {
      id: x.id, eventId: x.event_id, eventName: x.event_name, eventDate: x.event_date, venue: x.event_venue,
      status, seats: x.seat_labels, seatIds: x.seat_ids, holdExpiresAt: status === 'held' ? x.hold_expires_at : null,
      createdAt: x.created_at, confirmedAt: x.confirmed_at, cancelledAt: x.cancelled_at,
    };
  }
}
