import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useDatabase } from '@/src/db/DatabaseProvider';

import {
  DEFAULT_DEVICE_PREFERENCES,
  SqliteDevicePreferenceStore,
  type DevicePreferences,
  type DevicePreferenceStore,
  type SoundPreference,
  type ThemePreference,
} from './preferences';

type DevicePreferencesContextValue = {
  preferences: DevicePreferences;
  setTheme(theme: ThemePreference): Promise<void>;
  setSound(sound: SoundPreference): Promise<void>;
};

const DevicePreferencesContext =
  createContext<DevicePreferencesContextValue | null>(null);

export function useDevicePreferences(): DevicePreferencesContextValue {
  const context = useContext(DevicePreferencesContext);
  if (!context) {
    throw new Error(
      'useDevicePreferences must be used within DevicePreferencesProvider.',
    );
  }
  return context;
}

export function useDeviceThemePreference(): ThemePreference {
  return useContext(DevicePreferencesContext)?.preferences.theme
    ?? DEFAULT_DEVICE_PREFERENCES.theme;
}

export function DevicePreferencesProvider({
  store,
  children,
}: {
  store: DevicePreferenceStore;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState<DevicePreferences | null>(null);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreferences(null);
    setInitializationError(null);
    void store.load().then(
      (loaded) => {
        if (!cancelled) setPreferences(loaded);
      },
      (reason) => {
        if (!cancelled) {
          setInitializationError(
            reason instanceof Error
              ? reason
              : new Error('Device preferences could not be loaded.'),
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (initializationError) throw initializationError;

  const value = useMemo<DevicePreferencesContextValue>(
    () => ({
      preferences: preferences ?? DEFAULT_DEVICE_PREFERENCES,
      async setTheme(theme) {
        await store.saveTheme(theme);
        setPreferences((current) => ({
          ...(current ?? DEFAULT_DEVICE_PREFERENCES),
          theme,
        }));
      },
      async setSound(sound) {
        await store.saveSound(sound);
        setPreferences((current) => ({
          ...(current ?? DEFAULT_DEVICE_PREFERENCES),
          sound,
        }));
      },
    }),
    [preferences, store],
  );

  if (!preferences) return null;

  return (
    <DevicePreferencesContext.Provider value={value}>
      {children}
    </DevicePreferencesContext.Provider>
  );
}

export function AppDevicePreferencesProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const store = useMemo(
    () => new SqliteDevicePreferenceStore(database),
    [database],
  );
  return (
    <DevicePreferencesProvider store={store}>
      {children}
    </DevicePreferencesProvider>
  );
}
