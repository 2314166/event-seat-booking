import { bearer, bootstrap, Ctx, hold, makeEvent, makeUser, seatIds } from './helpers';

describe('Event seat booking', () => {
  let ctx: Ctx;
  let org: { token: string; id: number };
  let alice: { token: string; id: number };
  let bob: { token: string; id: number };
  let event: { id: number; totalSeats: number };
  let seats: number[];

  beforeAll(async () => {
    ctx = await bootstrap();
    org = await makeUser(ctx, 'org@test.com', 'organizer');
    alice = await makeUser(ctx, 'alice@test.com', 'attendee');
    bob = await makeUser(ctx, 'bob@test.com', 'attendee');
    event = await makeEvent(ctx, org.token, 5, 6);
    seats = await seatIds(ctx, alice.token, event.id);
  });

  afterAll(async () => { await ctx.app.close(); });

  beforeEach(async () => {
    ctx.clock.set(new Date('2026-11-08T10:00:00.000Z'));
    await ctx.db.query('TRUNCATE booking_seats, bookings RESTART IDENTITY CASCADE');
    await ctx.db.query(`UPDATE settings SET value='300' WHERE key='hold_duration_seconds'`);
    await ctx.db.query(`UPDATE settings SET value='4' WHERE key='max_seats_per_booking'`);
  });

  // ---------- Double-booking prevention ----------
  it('two competing holds for the same seat: exactly one succeeds (repeated 25x)', async () => {
    for (let round = 0; round < 25; round++) {
      await ctx.db.query('TRUNCATE booking_seats, bookings RESTART IDENTITY CASCADE');
      const seat = seats[round % seats.length];
      const [a, b] = await Promise.all([
        hold(ctx, alice.token, event.id, [seat]),
        hold(ctx, bob.token, event.id, [seat]),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const active = await ctx.db.query('SELECT count(*)::int n FROM booking_seats WHERE seat_id=$1 AND active', [seat]);
      expect(active.rows[0].n).toBe(1);
    }
  });

  it('10 attendees racing for one seat: exactly one wins', async () => {
    const users = [];
    for (let i = 0; i < 10; i++) users.push(await makeUser(ctx, `racer${i}@test.com`, 'attendee'));
    const results = await Promise.all(users.map((u) => hold(ctx, u.token, event.id, [seats[0]])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
  });

  it('database itself rejects a second active claim on a seat (UI/API cannot bypass)', async () => {
    const mk = async (userId: number) => (await ctx.db.query(
      `INSERT INTO bookings(event_id,user_id,status,hold_expires_at,created_at) VALUES($1,$2,'held',now()+interval '5 min',now()) RETURNING id`,
      [event.id, userId])).rows[0].id;
    const b1 = await mk(alice.id); const b2 = await mk(bob.id);
    await ctx.db.query('INSERT INTO booking_seats(booking_id,seat_id,active) VALUES($1,$2,true)', [b1, seats[0]]);
    await expect(
      ctx.db.query('INSERT INTO booking_seats(booking_id,seat_id,active) VALUES($1,$2,true)', [b2, seats[0]]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('overlapping multi-seat holds are all-or-nothing (no partial hold left behind)', async () => {
    const a = await hold(ctx, alice.token, event.id, [seats[0], seats[1]]);
    expect(a.status).toBe(201);
    const b = await hold(ctx, bob.token, event.id, [seats[1], seats[2]]);
    expect(b.status).toBe(409);
    const map = (await ctx.http().get(`/api/events/${event.id}/seats`).set(bearer(bob.token))).body;
    expect(map.find((s: any) => s.id === seats[2]).status).toBe('available');
  });

  // ---------- Hold expiry (fixed clock) ----------
  it('hold is released exactly when it expires (fixed clock)', async () => {
    const svc = ctx.app.get(require('../src/bookings/bookings.service').BookingsService);
    const res = await hold(ctx, alice.token, event.id, [seats[0]]);
    expect(res.status).toBe(201);
    expect(new Date(res.body.holdExpiresAt).toISOString()).toBe('2026-11-08T10:05:00.000Z');

    ctx.clock.set(new Date('2026-11-08T10:04:59.000Z')); // 1s before expiry: still held
    expect(await svc.releaseExpired()).toBe(0);
    let map = (await ctx.http().get(`/api/events/${event.id}/seats`).set(bearer(bob.token))).body;
    expect(map.find((s: any) => s.id === seats[0]).status).toBe('held');
    expect((await hold(ctx, bob.token, event.id, [seats[0]])).status).toBe(409);

    ctx.clock.set(new Date('2026-11-08T10:05:00.000Z')); // exactly at expiry: released
    expect(await svc.releaseExpired()).toBe(1);
    map = (await ctx.http().get(`/api/events/${event.id}/seats`).set(bearer(bob.token))).body;
    expect(map.find((s: any) => s.id === seats[0]).status).toBe('available');
    expect((await hold(ctx, bob.token, event.id, [seats[0]])).status).toBe(201);

    const hist = await ctx.http().get('/api/bookings/mine').set(bearer(alice.token));
    expect(hist.body[0].status).toBe('expired');
  });

  it('an expired-but-unswept hold does not block a new booking of that seat', async () => {
    await hold(ctx, alice.token, event.id, [seats[0]]);
    ctx.clock.advance(301_000);
    const res = await hold(ctx, bob.token, event.id, [seats[0]]);
    expect(res.status).toBe(201);
  });

  it('confirming after the hold expired is rejected with 410', async () => {
    const h = await hold(ctx, alice.token, event.id, [seats[0]]);
    ctx.clock.advance(301_000);
    const c = await ctx.http().post(`/api/bookings/${h.body.id}/confirm`).set(bearer(alice.token));
    expect(c.status).toBe(410);
  });

  // ---------- Booking flow ----------
  it('confirming a hold books the seats and the seat map shows them as booked', async () => {
    const h = await hold(ctx, alice.token, event.id, [seats[0], seats[1]]);
    const c = await ctx.http().post(`/api/bookings/${h.body.id}/confirm`).set(bearer(alice.token));
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('confirmed');
    ctx.clock.advance(3600_000); // booked seats never expire
    const map = (await ctx.http().get(`/api/events/${event.id}/seats`).set(bearer(bob.token))).body;
    expect(map.filter((s: any) => s.status === 'booked').map((s: any) => s.id).sort()).toEqual([seats[0], seats[1]].sort());
    expect((await hold(ctx, bob.token, event.id, [seats[0]])).status).toBe(409);
  });

  it("another attendee cannot confirm or cancel someone else's booking", async () => {
    const h = await hold(ctx, alice.token, event.id, [seats[0]]);
    expect((await ctx.http().post(`/api/bookings/${h.body.id}/confirm`).set(bearer(bob.token))).status).toBe(403);
    expect((await ctx.http().delete(`/api/bookings/${h.body.id}`).set(bearer(bob.token))).status).toBe(403);
  });

  it('cancelling a confirmed booking frees the seats and shows in history', async () => {
    const h = await hold(ctx, alice.token, event.id, [seats[3], seats[4]]);
    await ctx.http().post(`/api/bookings/${h.body.id}/confirm`).set(bearer(alice.token));
    const del = await ctx.http().delete(`/api/bookings/${h.body.id}`).set(bearer(alice.token));
    expect(del.status).toBe(200);
    expect(del.body.status).toBe('cancelled');
    const hist = await ctx.http().get('/api/bookings/mine').set(bearer(alice.token));
    expect(hist.body[0]).toMatchObject({ id: h.body.id, status: 'cancelled' });
    expect((await hold(ctx, bob.token, event.id, [seats[3], seats[4]])).status).toBe(201);
  });

  // ---------- Configuration (changes behaviour without a code change) ----------
  it('max seats per booking is configurable and applied immediately', async () => {
    const four = [seats[0], seats[1], seats[2], seats[3]];
    expect((await hold(ctx, alice.token, event.id, [...four, seats[4]])).status).toBe(400); // default max 4
    const put = await ctx.http().put('/api/settings').set(bearer(org.token)).send({ maxSeatsPerBooking: 2 });
    expect(put.status).toBe(200);
    expect((await hold(ctx, alice.token, event.id, four.slice(0, 3))).status).toBe(400);
    expect((await hold(ctx, alice.token, event.id, four.slice(0, 2))).status).toBe(201);
    await ctx.http().put('/api/settings').set(bearer(org.token)).send({ maxSeatsPerBooking: 5 });
    expect((await hold(ctx, alice.token, event.id, [...four, seats[4]])).status).toBe(201);
  });

  it('hold duration is configurable and applied immediately', async () => {
    await ctx.http().put('/api/settings').set(bearer(org.token)).send({ holdDurationSeconds: 60 });
    const h = await hold(ctx, alice.token, event.id, [seats[0]]);
    expect(new Date(h.body.holdExpiresAt).toISOString()).toBe('2026-11-08T10:01:00.000Z');
  });

  // ---------- Roles & validation ----------
  it('roles are enforced on the server', async () => {
    const date = '2027-01-01T10:00:00.000Z';
    const body = { name: 'X', date, venue: 'V', rows: 2, seatsPerRow: 2 };
    expect((await ctx.http().post('/api/events').send(body)).status).toBe(401);
    expect((await ctx.http().post('/api/events').set(bearer(alice.token)).send(body)).status).toBe(403);
    expect((await ctx.http().put('/api/settings').set(bearer(alice.token)).send({ maxSeatsPerBooking: 9 })).status).toBe(403);
    expect((await ctx.http().put(`/api/events/${event.id}/seating`).set(bearer(alice.token)).send({ rows: 1, seatsPerRow: 1 })).status).toBe(403);
    expect((await ctx.http().post('/api/events').set(bearer(org.token)).send(body)).status).toBe(201);
  });

  it('event setup validates a future date and a non-empty grid', async () => {
    const base = { name: 'X', venue: 'V', rows: 2, seatsPerRow: 2 };
    expect((await ctx.http().post('/api/events').set(bearer(org.token)).send({ ...base, date: '2026-11-07T10:00:00.000Z' })).status).toBe(400);
    expect((await ctx.http().post('/api/events').set(bearer(org.token)).send({ ...base, date: '2027-01-01T10:00:00.000Z', rows: 0 })).status).toBe(400);
    expect((await ctx.http().post('/api/events').set(bearer(org.token)).send({ ...base, date: '2027-01-01T10:00:00.000Z', seatsPerRow: 0 })).status).toBe(400);
  });

  it('seating cannot be changed while seats are held/booked, but can be when free', async () => {
    const ev = await makeEvent(ctx, org.token, 2, 2);
    const ids = await seatIds(ctx, alice.token, ev.id);
    await hold(ctx, alice.token, ev.id, [ids[0]]);
    expect((await ctx.http().put(`/api/events/${ev.id}/seating`).set(bearer(org.token)).send({ rows: 3, seatsPerRow: 3 })).status).toBe(409);
    ctx.clock.advance(301_000); // hold expires
    const ok = await ctx.http().put(`/api/events/${ev.id}/seating`).set(bearer(org.token)).send({ rows: 3, seatsPerRow: 3 });
    expect(ok.status).toBe(200);
    expect(ok.body.totalSeats).toBe(9);
  });
});
