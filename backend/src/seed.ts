import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
process.env.DISABLE_SWEEPER = '1';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './app.module';
import { DbService } from './db/db.service';
import { EventsService } from './events/events.service';

/** Idempotent seed: 1 organizer, 5 attendees, 2 events (120 + 60 seats), 30 confirmed sample bookings. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const db = app.get(DbService);
  const events = app.get(EventsService);

  const existing = await db.query('SELECT count(*)::int AS n FROM events');
  if (existing.rows[0].n > 0) {
    console.log('Seed skipped: events already exist.');
    await app.close();
    return;
  }

  const mkUser = async (email: string, name: string, pw: string, role: string) => {
    const r = await db.query(
      `INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
      [email, name, await bcrypt.hash(pw, 8), role]);
    return r.rows[0].id as number;
  };
  const org = await mkUser('organizer@demo.com', 'Olivia Organizer', 'organizer123', 'organizer');
  const attendees: number[] = [];
  for (const [i, n] of ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'].entries()) {
    attendees.push(await mkUser(`${n.toLowerCase()}@demo.com`, n, 'attendee123', 'attendee'));
  }

  const day = 86400000;
  const e1 = await events.create({
    name: 'Summer Music Festival', date: new Date(Date.now() + 30 * day).toISOString(), venue: 'Grand Arena, Chennai',
    description: 'An evening of live music with top artists under the open sky.', rows: 10, seatsPerRow: 12 }, org);
  const e2 = await events.create({
    name: 'Indie Film Night', date: new Date(Date.now() + 45 * day).toISOString(), venue: 'Lotus Cinema Hall, Chennai',
    description: 'A curated screening of award-winning independent short films.', rows: 6, seatsPerRow: 10 }, org);

  // 30 sample bookings: 20 on event 1, 10 on event 2. Each takes 1-3 adjacent seats; seats never overlap.
  const plan: Array<[number, number]> = [];
  for (let i = 0; i < 20; i++) plan.push([e1.id, 1 + (i % 3)]);
  for (let i = 0; i < 10; i++) plan.push([e2.id, 1 + (i % 2)]);

  const cursor: Record<number, number> = {};
  let n = 0;
  for (const [eventId, count] of plan) {
    const seats = await db.query('SELECT id FROM seats WHERE event_id=$1 ORDER BY row_no, seat_no', [eventId]);
    const start = cursor[eventId] ?? 0;
    const ids = seats.rows.slice(start, start + count).map((s: any) => s.id);
    cursor[eventId] = start + count + 1; // leave a gap seat so the map looks realistic
    const created = new Date(Date.now() - (30 - n) * 3600000);
    const b = await db.query(
      `INSERT INTO bookings(event_id,user_id,status,created_at,confirmed_at) VALUES($1,$2,'confirmed',$3,$3) RETURNING id`,
      [eventId, attendees[n % attendees.length], created]);
    await db.query(`INSERT INTO booking_seats(booking_id,seat_id,active) SELECT $1, unnest($2::int[]), true`, [b.rows[0].id, ids]);
    n++;
  }
  console.log(`Seeded: 2 events (${e1.totalSeats} + ${e2.totalSeats} seats), ${n} bookings.`);
  console.log('Organizer: organizer@demo.com / organizer123');
  console.log('Attendees: alice|bob|carol|dave|eve@demo.com / attendee123');
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
