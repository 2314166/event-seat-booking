import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.factory';
import { Clock, FixedClock } from '../src/common/clock';
import { DbService } from '../src/db/db.service';

export const T0 = new Date('2026-11-08T10:00:00.000Z');

export interface Ctx {
  app: INestApplication;
  db: DbService;
  clock: FixedClock;
  http: () => ReturnType<typeof request>;
}

/** Boots the real app against the TEST database with a controllable clock and the sweeper off. */
export async function bootstrap(): Promise<Ctx> {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgres://seat:seat@localhost:5432/seatbooking_test';
  process.env.DISABLE_SWEEPER = '1';
  const clock = new FixedClock(T0);
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock).useValue(clock)
    .compile();
  const app = configureApp(mod.createNestApplication());
  await app.init();
  const db = app.get(DbService);
  await db.query('TRUNCATE booking_seats, bookings, seats, events, users RESTART IDENTITY CASCADE');
  await db.query(`UPDATE settings SET value='300' WHERE key='hold_duration_seconds'`);
  await db.query(`UPDATE settings SET value='4' WHERE key='max_seats_per_booking'`);
  return { app, db, clock, http: () => request(app.getHttpServer()) };
}

export async function makeUser(ctx: Ctx, email: string, role: 'attendee' | 'organizer') {
  const hash = await bcrypt.hash('password1', 4);
  await ctx.db.query(
    `INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
    [email, email.split('@')[0], hash, role]);
  const res = await ctx.http().post('/api/auth/login').send({ email, password: 'password1' });
  return { token: res.body.token as string, id: res.body.user.id as number };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

export async function makeEvent(ctx: Ctx, token: string, rows = 5, seatsPerRow = 6) {
  const date = new Date(ctx.clock.now().getTime() + 7 * 86400000).toISOString();
  const res = await ctx.http().post('/api/events').set(bearer(token))
    .send({ name: 'Test Event', date, venue: 'Test Hall', rows, seatsPerRow });
  return res.body as { id: number; totalSeats: number };
}

export async function seatIds(ctx: Ctx, token: string, eventId: number): Promise<number[]> {
  const res = await ctx.http().get(`/api/events/${eventId}/seats`).set(bearer(token));
  return res.body.map((s: any) => s.id);
}

export const hold = (ctx: Ctx, token: string, eventId: number, ids: number[]) =>
  ctx.http().post(`/api/events/${eventId}/holds`).set(bearer(token)).send({ seatIds: ids });
