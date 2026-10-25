import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';

/** The floating +, hidden while a step is open. */
export function AddStepButton({
  colors,
  visible,
  bottom,
  onPress,
}: {
  colors: EditorColors;
  visible: boolean;
  bottom: number;
  onPress: () => void;
}) {
  const shown = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    // It hides at once and comes back with a 200 ms grow.
    shown.value = visible ? withTiming(1, { duration: 200 }) : 0;
  }, [shown, visible]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.25),
    transform: [{ scale: 0.6 + 0.4 * shown.value }],
  }));
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[{ position: 'absolute', right: 16, bottom, zIndex: 6 }, style]}
    >
      <Pressable
        testID="add-step"
        accessibilityRole="button"
        accessibilityLabel="Add a step"
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
        onPress={onPress}
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(28, 48, 41, 0.3), 0 2px 4px rgba(28, 48, 41, 0.2)',
        }}
      >
        <Icon name="plus" color={colors.onInk} size={24} strokeWidth={2.4} />
      </Pressable>
    </Animated.View>
  );
}
