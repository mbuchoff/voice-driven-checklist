import * as SQLite from 'expo-sqlite';

import type { Database } from './database';
import { runMigrations } from './migrations';

const DB_NAME = 'voice-checklist.db';

let dbPromise: Promise<Database> | null = null;

export function openDatabase(): Promise<Database> {
  return (dbPromise ??= initDatabase());
}

async function initDatabase(): Promise<Database> {
  const sqlite = await SQLite.openDatabaseAsync(DB_NAME);
  const db = sqlite as unknown as Database;
  await runMigrations(db);
  return db;
}
