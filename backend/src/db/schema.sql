CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('attendee','organizer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  venue TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  seat_rows INT NOT NULL CHECK (seat_rows > 0),
  seats_per_row INT NOT NULL CHECK (seats_per_row > 0),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seats (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  row_no INT NOT NULL,
  seat_no INT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE (event_id, row_no, seat_no)
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('held','confirmed','cancelled','expired')),
  hold_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- One row per (booking, seat). "active" is true while the booking is held or confirmed.
CREATE TABLE IF NOT EXISTS booking_seats (
  id SERIAL PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  seat_id INT NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- THE double-booking guard: a seat can have at most ONE active (held/confirmed) claim.
-- Enforced by PostgreSQL itself, so no API, UI or script can bypass it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_seats_one_active_per_seat
  ON booking_seats (seat_id) WHERE active;

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_expiry ON bookings(hold_expires_at) WHERE status = 'held';

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('hold_duration_seconds', '300'),
  ('max_seats_per_booking', '4')
ON CONFLICT (key) DO NOTHING;
