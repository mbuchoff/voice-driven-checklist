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

const defaultContext: DevicePreferencesContextValue = {
  preferences: DEFAULT_DEVICE_PREFERENCES,
  setTheme: async () => undefined,
  setSound: async () => undefined,
};

const DevicePreferencesContext =
  createContext<DevicePreferencesContextValue>(defaultContext);

export function useDevicePreferences(): DevicePreferencesContextValue {
  return useContext(DevicePreferencesContext);
}

export function DevicePreferencesProvider({
  store,
  children,
}: {
  store: DevicePreferenceStore;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState(DEFAULT_DEVICE_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    void store.load().then((loaded) => {
      if (!cancelled) setPreferences(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const value = useMemo<DevicePreferencesContextValue>(
    () => ({
      preferences,
      async setTheme(theme) {
        await store.saveTheme(theme);
        setPreferences((current) => ({ ...current, theme }));
      },
      async setSound(sound) {
        await store.saveSound(sound);
        setPreferences((current) => ({ ...current, sound }));
      },
    }),
    [preferences, store],
  );

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
