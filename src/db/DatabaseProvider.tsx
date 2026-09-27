import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Database } from './database';
import { openDatabase } from './openDatabase';
import { DatabaseOpenError } from './DatabaseOpenError';

const DatabaseContext = createContext<Database | null>(null);

export function useDatabase(): Database {
  const db = useContext(DatabaseContext);
  if (!db) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return db;
}

export function DatabaseProvider({
  database,
  children,
}: {
  database: Database;
  children: ReactNode;
}) {
  return <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>;
}

export function AppDatabaseProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [database, setDatabase] = useState<Database | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    openDatabase()
      .then((db) => {
        if (!cancelled) setDatabase(db);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (failed) return <DatabaseOpenError onRetry={() => setAttempt((current) => current + 1)} />;

  if (!database) return null;

  return <DatabaseProvider database={database}>{children}</DatabaseProvider>;
}
