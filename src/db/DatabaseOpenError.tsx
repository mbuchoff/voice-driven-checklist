import { Pressable, Text, useColorScheme, View } from 'react-native';

import { dark, light } from '@/src/theme/palette';

export function DatabaseOpenError({ onRetry }: { onRetry: () => void }) {
  // Device preferences cannot load until the database opens.
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? dark : light;
  return (
    <View
      testID="database-open-error"
      style={{
        flex: 1,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        backgroundColor: theme.background,
      }}
    >
      <Text
        style={{
          color: theme.text,
          fontSize: 28,
          lineHeight: 32,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        Couldn’t open your library
      </Text>
      <Text
        style={{
          color: theme.textMuted,
          fontSize: 16,
          lineHeight: 22,
          textAlign: 'center',
        }}
      >
        Your routines have not been changed. Try opening the library again.
      </Text>
      <Pressable
        accessibilityRole="button"
        testID="database-open-retry"
        onPress={onRetry}
        style={{
          minWidth: 132,
          minHeight: 48,
          paddingHorizontal: 22,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.primary,
        }}
      >
        <Text
          style={{
            color: colorScheme === 'dark' ? theme.background : theme.onPrimary,
            fontSize: 15,
            fontWeight: '800',
          }}
        >
          Retry
        </Text>
      </Pressable>
    </View>
  );
}
