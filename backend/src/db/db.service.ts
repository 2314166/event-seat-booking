import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgres://seat:seat@localhost:5432/seatbooking',
    max: 20,
  });

  async onModuleInit() {
    await this.migrate();
  }

  async migrate() {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await this.pool.query(sql);
  }

  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
