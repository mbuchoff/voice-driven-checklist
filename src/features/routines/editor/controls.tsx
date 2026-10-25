import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

/** A 44 dp round icon button, shared by the editor's bar and card. */
export function IconButton({
  label,
  onPress,
  children,
  testID,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  testID?: string;
  disabled?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {children}
    </Pressable>
  );
}
