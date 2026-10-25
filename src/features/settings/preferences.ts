import type { Database } from '@/src/db/database';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export const SOUND_PREFERENCES = ['chime', 'wood', 'ping', 'quiet'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type SoundPreference = (typeof SOUND_PREFERENCES)[number];

export type DevicePreferences = {
  theme: ThemePreference;
  sound: SoundPreference;
  routineReorderHintDismissed: boolean;
  /** Timer lengths (seconds) last used on this device, most recent first. */
  recentTimerSeconds: number[];
};

/** How many timer lengths are remembered as used most recently. */
export const RECENT_TIMER_LIMIT = 4;

/** Using a timer length moves it to the front of the remembered ones. */
export function rememberTime(recent: readonly number[], seconds: number): number[] {
  return [seconds, ...recent.filter((time) => time !== seconds)].slice(0, RECENT_TIMER_LIMIT);
}

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  theme: 'system',
  sound: 'chime',
  routineReorderHintDismissed: false,
  recentTimerSeconds: [],
};

function parseRecentTimerSeconds(json: string | null | undefined): number[] {
  try {
    const parsed: unknown = JSON.parse(json ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => Number.isInteger(value) && value > 0)
      : [];
  } catch {
    return [];
  }
}

export interface DevicePreferenceStore {
  load(): Promise<DevicePreferences>;
  saveTheme(theme: ThemePreference): Promise<void>;
  saveSound(sound: SoundPreference): Promise<void>;
  dismissRoutineReorderHint(): Promise<void>;
  saveRecentTimerSeconds(recent: number[]): Promise<void>;
}

export class SqliteDevicePreferenceStore implements DevicePreferenceStore {
  constructor(private readonly database: Database) {}

  async load(): Promise<DevicePreferences> {
    const preferences = await this.database.getFirstAsync<{
      theme: ThemePreference;
      sound: SoundPreference;
      routine_reorder_hint_dismissed: number;
      recent_timer_seconds: string;
    }>(
      `SELECT theme, sound, routine_reorder_hint_dismissed, recent_timer_seconds
       FROM device_preferences
       WHERE id = 1`,
    );
    if (!preferences) throw new Error('Device preferences are missing.');
    return {
      theme: preferences.theme,
      sound: preferences.sound,
      routineReorderHintDismissed:
        preferences.routine_reorder_hint_dismissed === 1,
      recentTimerSeconds: parseRecentTimerSeconds(preferences.recent_timer_seconds),
    };
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

  async dismissRoutineReorderHint(): Promise<void> {
    const result = await this.database.runAsync(
      `UPDATE device_preferences
       SET routine_reorder_hint_dismissed = 1
       WHERE id = 1`,
    );
    if (result.changes !== 1) throw new Error('Device preferences are missing.');
  }

  async saveRecentTimerSeconds(recent: number[]): Promise<void> {
    const result = await this.database.runAsync(
      `UPDATE device_preferences SET recent_timer_seconds = ? WHERE id = 1`,
      JSON.stringify(recent),
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

  async dismissRoutineReorderHint(): Promise<void> {
    this.preferences = {
      ...this.preferences,
      routineReorderHintDismissed: true,
    };
  }

  async saveRecentTimerSeconds(recent: number[]): Promise<void> {
    this.preferences = { ...this.preferences, recentTimerSeconds: [...recent] };
  }
}
