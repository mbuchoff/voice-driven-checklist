import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';

import { dark, light } from '@/src/theme/palette';

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
    const theme = colorScheme === 'dark' ? dark : light;
    return (
      <View
        testID="database-open-error"
        style={{
          flex: 1,
          padding: 32,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          backgroundColor: theme.background,
        }}
      >
        <Text
          style={{
            color: theme.text,
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
            color: theme.textMuted,
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
            backgroundColor: theme.primary,
          }}
        >
          <Text
            style={{
              color: colorScheme === 'dark' ? theme.background : theme.onPrimary,
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
