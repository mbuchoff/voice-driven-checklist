import type { Database } from '@/src/db/database';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export const SOUND_PREFERENCES = ['chime', 'wood', 'ping', 'quiet'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type SoundPreference = (typeof SOUND_PREFERENCES)[number];

export type DevicePreferences = {
  theme: ThemePreference;
  sound: SoundPreference;
};

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  theme: 'system',
  sound: 'chime',
};

export interface DevicePreferenceStore {
  load(): Promise<DevicePreferences>;
  saveTheme(theme: ThemePreference): Promise<void>;
  saveSound(sound: SoundPreference): Promise<void>;
}

export class SqliteDevicePreferenceStore implements DevicePreferenceStore {
  constructor(private readonly database: Database) {}

  async load(): Promise<DevicePreferences> {
    const preferences = await this.database.getFirstAsync<DevicePreferences>(
      `SELECT theme, sound
       FROM device_preferences
       WHERE id = 1`,
    );
    if (!preferences) throw new Error('Device preferences are missing.');
    return preferences;
  }

  async saveTheme(theme: ThemePreference): Promise<void> {
    const result = await this.database.runAsync(
      `UPDATE device_preferences SET theme = ? WHERE id = 1`,
      theme,
    );
    if (result.changes !== 1) throw new Error('Device preferences are missing.');
  }

  async saveSound(sound: SoundPreference): Promise<void> {
    const result = await this.database.runAsync(
      `UPDATE device_preferences SET sound = ? WHERE id = 1`,
      sound,
    );
    if (result.changes !== 1) throw new Error('Device preferences are missing.');
  }
}

export class MemoryDevicePreferenceStore implements DevicePreferenceStore {
  constructor(private preferences: DevicePreferences = DEFAULT_DEVICE_PREFERENCES) {}

  async load(): Promise<DevicePreferences> {
    return this.preferences;
  }

  async saveTheme(theme: ThemePreference): Promise<void> {
    this.preferences = { ...this.preferences, theme };
  }

  async saveSound(sound: SoundPreference): Promise<void> {
    this.preferences = { ...this.preferences, sound };
  }
}
