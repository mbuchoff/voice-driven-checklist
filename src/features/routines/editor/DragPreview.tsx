import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import Animated from 'react-native-reanimated';

import type { EditorColors } from '../editorColors';
import { NumberBadge } from './NumberBadge';
import { CONTENT_LEFT, LIST_PAD_X, ROW_GAP, ROW_PAD_Y, STEP_WORDS, TEXT_PAD } from './stepRowMetrics';

/** The held step, floating above the list while it's dragged. */
export function DragPreview({
  colors,
  top,
  height,
  number,
  text,
  style,
}: {
  colors: EditorColors;
  top: number;
  height: number;
  number: number;
  text: string;
  style: ComponentProps<typeof Animated.View>['style'];
}) {
  return (
    <Animated.View
      testID="step-drag-preview"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top,
          left: LIST_PAD_X,
          right: LIST_PAD_X,
          minHeight: height,
          paddingVertical: ROW_PAD_Y,
          paddingHorizontal: CONTENT_LEFT,
          borderRadius: 16,
          backgroundColor: colors.fill,
          boxShadow: '0 16px 34px rgba(28, 48, 41, 0.3)',
          flexDirection: 'row',
          alignItems: 'center',
          gap: ROW_GAP,
          zIndex: 30,
          transform: [{ scale: 1.04 }],
        },
        style,
      ]}
    >
      <NumberBadge number={number} color={colors.ink} background={colors.surface} />
      <Text
        testID="step-drag-preview-text"
        style={{ flex: 1, color: colors.text, ...STEP_WORDS, paddingHorizontal: TEXT_PAD.x }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}
