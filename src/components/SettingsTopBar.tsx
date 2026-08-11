import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

import { Icon } from './Icon';

export function SettingsTopBar({
  backLabel,
  onBack,
  title,
}: {
  backLabel: string;
  onBack: () => void;
  title: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        minHeight: 66,
        paddingHorizontal: 20,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor: theme.surfaceSoft,
        flexDirection: 'row',
        alignItems: 'flex-end',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        style={{
          width: 40,
          height: 40,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 20,
          backgroundColor: theme.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="arrowLeft" color={theme.primary} size={19} />
      </Pressable>
      <Text
        style={{
          position: 'absolute',
          left: 64,
          right: 64,
          bottom: 24,
          color: theme.text,
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 1.2,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
    </View>
  );
}
