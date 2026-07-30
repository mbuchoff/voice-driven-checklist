import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Text, View } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackRoute() {
  const theme = useTheme();
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
