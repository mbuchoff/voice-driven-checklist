// Polyfills crypto.getRandomValues() — required by `uuid` on Hermes (Android).
import 'react-native-get-random-values';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppDatabaseProvider } from '@/src/db/DatabaseProvider';
import { AppAccountProvider } from '@/src/features/account/AccountProvider';
import { AppDevicePreferencesProvider } from '@/src/features/settings/DevicePreferencesProvider';
import { registerListeningService } from '@/src/services/speech/foregroundService';
import { useResolvedColorScheme } from '@/src/theme/useTheme';

registerListeningService();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppDatabaseProvider>
        <AppDevicePreferencesProvider>
          <AppAccountProvider>
            <ThemedNavigation />
          </AppAccountProvider>
        </AppDevicePreferencesProvider>
      </AppDatabaseProvider>
    </GestureHandlerRootView>
  );
}

function ThemedNavigation() {
  const scheme = useResolvedColorScheme();
  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={navigationTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Voice Checklist' }} />
        <Stack.Screen name="checklists/new" options={{ headerShown: false }} />
        <Stack.Screen name="checklists/[id]/edit" options={{ headerShown: false }} />
        <Stack.Screen name="run/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/index" options={{ headerShown: false }} />
        <Stack.Screen name="settings/account" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
