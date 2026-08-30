import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';

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

export function AppDatabaseProvider({
  children,
  open = openDatabase,
}: {
  children: ReactNode;
  open?: () => Promise<Database>;
}) {
  const [database, setDatabase] = useState<Database | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const colorScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    open()
      .then((db) => {
        if (!cancelled) setDatabase(db);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, open]);

  if (failed) {
    const dark = colorScheme === 'dark';
    return (
      <View
        testID="database-open-error"
        style={{
          flex: 1,
          padding: 32,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          backgroundColor: dark ? '#101814' : '#f8f4ec',
        }}
      >
        <Text
          style={{
            color: dark ? '#f4efe5' : '#17372d',
            fontSize: 28,
            lineHeight: 32,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          Couldn’t open your library
        </Text>
        <Text
          style={{
            color: dark ? '#bac7c0' : '#64756e',
            fontSize: 16,
            lineHeight: 22,
            textAlign: 'center',
          }}
        >
          Your routines have not been changed. Try opening the library again.
        </Text>
        <Pressable
          accessibilityRole="button"
          testID="database-open-retry"
          onPress={() => setAttempt((current) => current + 1)}
          style={{
            minWidth: 132,
            minHeight: 48,
            paddingHorizontal: 22,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: dark ? '#8fd5b6' : '#1f684f',
          }}
        >
          <Text
            style={{
              color: dark ? '#10261f' : '#ffffff',
              fontSize: 15,
              fontWeight: '800',
            }}
          >
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!database) return null;

  return <DatabaseProvider database={database}>{children}</DatabaseProvider>;
}
