import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Database } from './database';
import { openDatabase } from './openDatabase';

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

export function AppDatabaseProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<Database | null>(null);

  useEffect(() => {
    let cancelled = false;
    openDatabase().then((db) => {
      if (!cancelled) setDatabase(db);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!database) return null;

  return <DatabaseProvider database={database}>{children}</DatabaseProvider>;
}
