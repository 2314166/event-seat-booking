import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { PoolClient } from 'pg';

export interface AppSettings { holdDurationSeconds: number; maxSeatsPerBooking: number }

@Injectable()
export class SettingsService {
  constructor(private db: DbService) {}

  /** Read from the DB on every call (no caching) so a change applies immediately, no code change/restart. */
  async get(client?: PoolClient): Promise<AppSettings> {
    const q: { query(t: string, p?: any[]): Promise<any> } = client ?? this.db;
    const r = await q.query('SELECT key, value FROM settings');
    const m = Object.fromEntries(r.rows.map((x: any) => [x.key, x.value]));
    return {
      holdDurationSeconds: parseInt(m['hold_duration_seconds'] ?? '300', 10),
      maxSeatsPerBooking: parseInt(m['max_seats_per_booking'] ?? '4', 10),
    };
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const up = (k: string, v: number) =>
      this.db.query(
        'INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
        [k, String(v)],
      );
    if (patch.holdDurationSeconds !== undefined) await up('hold_duration_seconds', patch.holdDurationSeconds);
    if (patch.maxSeatsPerBooking !== undefined) await up('max_seats_per_booking', patch.maxSeatsPerBooking);
    return this.get();
  }
}
