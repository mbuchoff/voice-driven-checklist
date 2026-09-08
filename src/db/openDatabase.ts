import * as SQLite from 'expo-sqlite';

import type { Database } from './database';
import { runMigrations } from './migrations';

const DB_NAME = 'voice-checklist.db';

let dbPromise: Promise<Database> | null = null;

export function openDatabase(): Promise<Database> {
  dbPromise ??= initDatabase().catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

async function initDatabase(): Promise<Database> {
  const sqlite = await SQLite.openDatabaseAsync(DB_NAME);
  const db = sqlite as unknown as Database;
  try {
    await runMigrations(db);
    return db;
  } catch (error) {
    try {
      await db.closeAsync();
    } catch {
      // Preserve the initialization error if closing the failed handle also fails.
    }
    throw error;
  }
}
