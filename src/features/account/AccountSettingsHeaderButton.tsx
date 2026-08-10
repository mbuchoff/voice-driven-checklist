import { Pressable } from 'react-native';

import { Icon } from '@/src/components/Icon';
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
      accessibilityLabel="Settings"
      hitSlop={10}
      onPress={onPress}
      style={{ paddingHorizontal: 6, paddingVertical: 4 }}
    >
      <Icon name="settings" color={theme.text} size={20} />
    </Pressable>
  );
}
