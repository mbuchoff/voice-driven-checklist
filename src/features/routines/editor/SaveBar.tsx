import { Pressable, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import type { EditorColors } from '../editorColors';

/** "Create routine" or "Save changes", shown while saving would change something. */
export function SaveBar({
  colors,
  isNew,
  enabled,
  bottomInset,
  onHeight,
  onSave,
}: {
  colors: EditorColors;
  isNew: boolean;
  enabled: boolean;
  bottomInset: number;
  onHeight: (height: number) => void;
  onSave: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(75)}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
      style={{
        paddingTop: 12,
        paddingHorizontal: 16,
        paddingBottom: 16 + bottomInset,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.tint,
      }}
    >
      <Pressable
        testID="save"
        accessibilityRole="button"
        accessibilityState={{ disabled: !enabled }}
        disabled={!enabled}
        onPress={onSave}
        style={{
          height: 54,
          borderRadius: 17,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: enabled ? 1 : 0.4,
        }}
      >
        <Text style={{ color: colors.onInk, fontSize: 16, fontWeight: '700' }}>
          {isNew ? 'Create routine' : 'Save changes'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
