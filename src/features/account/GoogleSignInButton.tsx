import { Image, Pressable, Text } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

export function GoogleSignInButton({
  onPress,
  disabled = false,
  label = 'Continue with Google',
}: {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const dark = useTheme().mode === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: dark ? '#8e918f' : '#747775',
        backgroundColor: dark ? '#131314' : '#ffffff',
        opacity: disabled ? 0.6 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        accessibilityIgnoresInvertColors
        source={require('@/assets/images/google-g-logo.png')}
        style={{ width: 20, height: 20.4, marginRight: 10 }}
      />
      <Text
        style={{
          color: dark ? '#e3e3e3' : '#1f1f1f',
          fontSize: 14,
          lineHeight: 20,
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
