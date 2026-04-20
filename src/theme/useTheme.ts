import { useColorScheme } from 'react-native';

import { dark, light, type Palette } from './palette';

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
