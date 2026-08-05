import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackRoute() {
  const theme = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== 'web') router.back();
  }, [router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: theme.background,
      }}
    >
      <ActivityIndicator />
      <Text style={{ color: theme.text }}>Completing Google sign-in…</Text>
    </View>
  );
}
