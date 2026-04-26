// Polyfills crypto.getRandomValues() — required by `uuid` on Hermes (Android).
import 'react-native-get-random-values';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AppDatabaseProvider } from '@/src/db/DatabaseProvider';
import { registerListeningService } from '@/src/services/speech/foregroundService';

registerListeningService();

export default function RootLayout() {
  const scheme = useColorScheme();
  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <AppDatabaseProvider>
      <ThemeProvider value={navigationTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'Checklists' }} />
          <Stack.Screen name="checklists/new" options={{ title: 'New Checklist' }} />
          <Stack.Screen name="checklists/[id]/edit" options={{ title: 'Edit Checklist' }} />
          <Stack.Screen name="run/[id]" options={{ title: 'Run', headerBackVisible: false }} />
        </Stack>
      </ThemeProvider>
      <StatusBar style="auto" />
    </AppDatabaseProvider>
  );
}
