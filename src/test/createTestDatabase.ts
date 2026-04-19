import BetterSqlite3 from 'better-sqlite3';

import type { Database, RunResult } from '@/src/db/database';

export function createTestDatabase(): Database {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  return {
    async execAsync(source: string) {
      sqlite.exec(source);
    },

    async runAsync(sql: string, ...params: unknown[]): Promise<RunResult> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(params as never[]));
      const lastInsertRowId =
        typeof info.lastInsertRowid === 'bigint'
          ? Number(info.lastInsertRowid)
          : (info.lastInsertRowid as number);
      return {
        changes: info.changes,
        lastInsertRowId,
      };
    },

    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...(params as never[])) as T[];
    },

    async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(params as never[]));
      return (row ?? null) as T | null;
    },

    async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
      sqlite.exec('BEGIN');
      try {
        await callback();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },

    async closeAsync() {
      sqlite.close();
    },
  };
}
