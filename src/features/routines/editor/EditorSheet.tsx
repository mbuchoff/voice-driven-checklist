import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EditorColors } from '../editorColors';

// Sheets fade in over 150 ms and out over 75 ms, like the prototype's.
const ENTER = FadeIn.duration(150);
const EXIT = FadeOut.duration(75);

/** A bottom sheet over a dimmed screen; tapping the dim area calls onDismiss. */
export function EditorSheet({
  colors,
  onDismiss,
  children,
  testID,
  accessibilityLabel,
}: {
  colors: EditorColors;
  onDismiss: () => void;
  children: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30 }}>
      <Animated.View entering={ENTER} exiting={EXIT} style={{ flex: 1 }}>
        <Pressable
          testID={testID ? `${testID}-scrim` : undefined}
          accessible={false}
          onPress={onDismiss}
          style={{ flex: 1, backgroundColor: colors.scrim }}
        />
      </Animated.View>
      <Animated.View
        entering={ENTER}
        exiting={EXIT}
        testID={testID}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 10,
          paddingHorizontal: 20,
          paddingBottom: 20 + insets.bottom,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: colors.surface,
          gap: 8,
        }}
      >
        <View
          style={{
            width: 36,
            height: 4,
            marginBottom: 8,
            alignSelf: 'center',
            borderRadius: 2,
            backgroundColor: colors.border,
          }}
        />
        {children}
      </Animated.View>
    </View>
  );
}

export function SheetTitle({ colors, children }: { colors: EditorColors; children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 }}
    >
      {children}
    </Text>
  );
}

export function SheetBody({ colors, children }: { colors: EditorColors; children: ReactNode }) {
  return (
    <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 21, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

type SheetButtonVariant = 'keep' | 'discard' | 'discardSoft' | 'strong' | 'done';

export function SheetButton({
  colors,
  variant,
  label,
  onPress,
  disabled,
  testID,
}: {
  colors: EditorColors;
  variant: SheetButtonVariant;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const looks: Record<SheetButtonVariant, { box: ViewStyle; text: string }> = {
    keep: { box: { borderWidth: 1.5, borderColor: colors.primary }, text: colors.primary },
    discard: { box: { backgroundColor: colors.danger }, text: colors.onDanger },
    discardSoft: { box: { borderWidth: 1.5, borderColor: colors.danger }, text: colors.danger },
    strong: { box: { backgroundColor: colors.ink }, text: colors.onInk },
    done: { box: { backgroundColor: colors.primary }, text: colors.onPrimary },
  };
  const look = looks[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        ...look.box,
      }}
    >
      <Text style={{ color: look.text, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function SheetActions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>;
}
