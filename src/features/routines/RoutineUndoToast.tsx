import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Palette } from '@/src/theme/palette';

import { useUndoTimeout } from './useUndoTimeout';

/** How long UNDO is offered (longer if Android's accessibility timeout asks). */
export const ROUTINE_UNDO_MS = 5000;

const TOAST_COLORS = {
  light: { background: '#1f302b', text: '#f3f2eb', action: '#9dceb7' },
  dark: { background: '#f3f2eb', text: '#17241f', action: '#245c49' },
} as const;

export function RoutineUndoToast({
  theme,
  title,
  onUndo,
  onExpire,
}: {
  theme: Palette;
  title: string;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const insets = useSafeAreaInsets();
  const look = TOAST_COLORS[theme.mode];
  const message = `“${title}” deleted`;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(message);
    // Announced once per offered routine (the toast is keyed by routine id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useUndoTimeout(ROUTINE_UNDO_MS, onExpire);

  return (
    <Animated.View
      testID="routine-undo-toast"
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(75)}
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 88 + insets.bottom,
        minHeight: 48,
        paddingLeft: 16,
        paddingRight: 6,
        borderRadius: 14,
        backgroundColor: look.background,
        boxShadow: '0 8px 22px rgba(16, 26, 22, 0.28)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 20,
      }}
    >
      <Text numberOfLines={1} style={{ flex: 1, color: look.text, fontSize: 14 }}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        onPress={onUndo}
        style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}
      >
        <Text style={{ color: look.action, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 }}>UNDO</Text>
      </Pressable>
    </Animated.View>
  );
}
