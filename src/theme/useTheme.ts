import { useColorScheme, type ColorSchemeName } from 'react-native';

import { useDevicePreferences } from '@/src/features/settings/DevicePreferencesProvider';
import type { ThemePreference } from '@/src/features/settings/preferences';

import { dark, light, type Palette } from './palette';

export function resolveTheme(
  preference: ThemePreference,
  systemScheme: ColorSchemeName | 'unspecified',
): Palette {
  const scheme = preference === 'system' ? systemScheme : preference;
  return scheme === 'dark' ? dark : light;
}

export function useTheme(): Palette {
  const { preferences } = useDevicePreferences();
  return resolveTheme(preferences.theme, useColorScheme());
}

export function useResolvedColorScheme(): 'light' | 'dark' {
  return useTheme() === dark ? 'dark' : 'light';
}
