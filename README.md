# SeatBook — Event Seat Booking with Double-Booking Prevention

Full TypeScript stack: **Angular 22** (frontend) · **NestJS 11** (API) · **PostgreSQL 16**.

## Quick start (clean machine)

Prerequisites: Node 20+ and Docker (or any local PostgreSQL 16).

```bash
# 1. Database (creates `seatbooking` and `seatbooking_test`)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env
npm install --legacy-peer-deps
npm run seed          # 2 events (120 + 60 seats), 30 sample bookings, demo users
npm start             # http://localhost:3000/api   (schema is auto-applied on boot)

# 3. Frontend (new terminal)
cd frontend
npm install
npm start             # http://localhost:4200  (proxies /api -> :3000)
```

No Docker? Create the DBs yourself: `createdb seatbooking && createdb seatbooking_test`, with user/password `seat`/`seat` (or edit `backend/.env`).

**Demo logins**

| Role | Email | Password |
|---|---|---|
| Organizer | organizer@demo.com | organizer123 |
| Attendee | alice@demo.com / bob@demo.com / carol / dave / eve | attendee123 |

## Running the tests

```bash
cd backend
npm test        # 15 tests, run against the real Postgres `seatbooking_test` DB
```

Tests boot the real Nest app with an injectable **fixed clock**. Highlights:

- two competing holds for the same seat → exactly one succeeds (repeated 25×), and 10 users racing for one seat → exactly one wins
- the database itself rejects a second active claim on a seat (bypasses the API entirely)
- multi-seat holds are all-or-nothing
- a hold is released exactly at its expiry time (fixed clock: 1s before → still held, at expiry → released)
- confirm-after-expiry → 410; cancel frees seats; role enforcement; date/grid validation; config changes alter behaviour

## Features

**Baseline**
- Roles `attendee` / `organizer`, enforced server-side by a global JWT guard + `@Roles()` (public sign-up only creates attendees).
- Organizer: create events (name, date, venue, rows × seats grid), change seating, change settings. Date must be in the future; grid can't be empty.
- Live seat map (available / held / booked, "yours" highlighted) polling every 3 s.
- Booking flow: select up to *max seats* → hold for *hold duration* (countdown shown) → confirm to book, or release.
- Booking history per attendee with cancellation that frees the seats.
- Admin-configurable `hold_duration_seconds` (default 300) and `max_seats_per_booking` (default 4), read from the DB on every request — change takes effect immediately, no code change or restart.
- Seed data: events with 120 and 60 seats, 30 sample bookings.

**Extras**
- ✨ AI-drafted event descriptions (`POST /api/events/ai-description`). Uses Claude when `ANTHROPIC_API_KEY` is set in `backend/.env`; falls back to a template otherwise.
- Hold recovery after page refresh; selection auto-drops seats others just took; seating can't be reshaped while seats are held/booked; background sweeper for expired holds.

## Where double-booking is prevented (and why the UI can't bypass it)

In **PostgreSQL**, not in the interface or even only in application code:

```sql
CREATE UNIQUE INDEX uq_booking_seats_one_active_per_seat
  ON booking_seats (seat_id) WHERE active;
```

Every held or confirmed booking owns rows in `booking_seats` with `active = true`. Postgres allows **at most one active row per seat**. When two people click at the same instant, both transactions try to insert; the second blocks on the index until the first commits, then fails with `23505` → the API returns `409 Conflict`. Because the whole booking is one transaction, a losing multi-seat request leaves nothing behind. Cancelling/expiring flips `active` to `false` in the same transaction, which frees the seat. Seat ids are also sorted before inserting so concurrent multi-seat requests can't deadlock.

The browser only ever calls the API, and the API itself can't violate the index — so no client, script, or bug in the UI can create a double booking.

## Hold expiry

- The sweeper (`BookingsService.releaseExpired`, every 5 s) marks held bookings with `hold_expires_at <= now` as `expired` and frees their seats.
- Independently, a new hold on a seat first releases expired holds on exactly those seats inside its transaction, so an expired-but-unswept hold never blocks anyone.
- Time comes from an injectable `Clock`; tests swap in a `FixedClock`.

## Architecture

```
frontend/ (Angular, signals, standalone components)
  pages: login · events · event-detail (seat map + booking) · history · event-form · settings
  auth.ts (JWT interceptor, route guards)  api.ts (HTTP client)
backend/ (NestJS)
  common/auth.ts      global AuthGuard, @Roles, @Public
  common/clock.ts     Clock / SystemClock / FixedClock
  db/                 pg Pool, transaction helper, schema.sql (auto-applied)
  events/             create, seating, seat map
  bookings/           hold · confirm · cancel · history · expiry sweeper
  settings/           admin-configurable values
  ai/                 description drafting
  test/               Jest suite (real Postgres)
```

REST API (all under `/api`, JWT bearer): `POST /auth/register|login`, `GET /auth/me`; `GET /events`, `GET /events/:id`, `GET /events/:id/seats`, `POST /events` (org), `PATCH /events/:id` (org), `PUT /events/:id/seating` (org), `POST /events/ai-description` (org), `POST /events/:id/holds` (attendee); `POST /bookings/:id/confirm` (attendee), `DELETE /bookings/:id`, `GET /bookings/mine` (attendee); `GET /settings`, `PUT /settings` (org).

## Data model

| Table | Purpose |
|---|---|
| `users` | email (unique), name, password_hash, `role` ∈ attendee/organizer |
| `events` | name, date, venue, description, seat_rows, seats_per_row |
| `seats` | one row per physical seat; unique (event_id, row_no, seat_no) |
| `bookings` | event, user, `status` ∈ held/confirmed/cancelled/expired, `hold_expires_at`, timestamps |
| `booking_seats` | (booking, seat, `active`) — **partial unique index on `seat_id WHERE active`** |
| `settings` | key/value config (`hold_duration_seconds`, `max_seats_per_booking`) |

## Demo script (5 min)

1. Log in as Alice and Bob in two browsers → open the same event; select the same seat in both, click *Hold* at the same time → one gets "seats were just taken".
2. Watch the countdown; let a hold expire → seat turns green again in the other browser.
3. Log in as organizer → Settings: set hold to 30 s and max seats to 2 → new holds obey it instantly.
4. `npm test` in `backend/` and walk through the unique index above.
