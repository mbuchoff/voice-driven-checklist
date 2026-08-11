import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

export function SettingsCard({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 22,
        padding: 17,
        gap: 12,
        boxShadow: `0 3px 10px ${theme.shadow}`,
      }}
    >
      {children}
    </View>
  );
}
