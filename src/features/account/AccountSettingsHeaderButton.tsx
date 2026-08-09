import { Pressable, Text } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

export function AccountSettingsHeaderButton({
  onPress,
}: {
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Account settings"
      hitSlop={10}
      onPress={onPress}
      style={{ paddingHorizontal: 6, paddingVertical: 4 }}
    >
      <Text style={{ color: theme.text, fontSize: 22 }}>⚙</Text>
    </Pressable>
  );
}
