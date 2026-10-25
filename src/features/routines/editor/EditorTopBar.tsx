import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { IconButton } from './controls';

const FOLD_MS = 180;

/**
 * Back, the title, ▶ when the routine can run, and (for an existing routine)
 * Delete. Once the name scrolls under it, the bar folds into the card: it
 * takes the routine's color and shows its title and count. The color dot
 * stays on the card.
 */
export function EditorTopBar({
  colors,
  collapsed,
  isNew,
  title,
  countLine,
  canRun,
  onBack,
  onDelete,
  onPlay,
}: {
  colors: EditorColors;
  collapsed: boolean;
  isNew: boolean;
  /** The routine's name as shown (see displayTitle). */
  title: string;
  countLine: string;
  /** ▶ shows only for a saved routine with nothing unsaved that can run. */
  canRun: boolean;
  onBack: () => void;
  onDelete: () => void;
  onPlay: () => void;
}) {
  const fold = useSharedValue(collapsed ? 1 : 0);
  useEffect(() => {
    fold.value = withTiming(collapsed ? 1 : 0, { duration: FOLD_MS });
  }, [collapsed, fold]);
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 1 - fold.value,
    transform: [{ translateY: interpolate(fold.value, [0, 1], [0, -6]) }],
  }));
  const miniStyle = useAnimatedStyle(() => ({
    opacity: fold.value,
    transform: [{ translateY: interpolate(fold.value, [0, 1], [6, 0]) }],
  }));

  return (
    <View style={{ zIndex: 5 }}>
      <View
        testID="editor-top-bar"
        style={{
          height: 60,
          paddingHorizontal: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: collapsed ? colors.fill : 'transparent',
          boxShadow: collapsed ? `0 2px 8px ${colors.shadow}` : undefined,
        }}
      >
        <IconButton label="Back" testID="editor-back" onPress={onBack}>
          <Icon name="arrowLeft" color={colors.text} size={22} />
        </IconButton>
        {/* Balances ▶ so the title stays centered. */}
        <View style={{ width: 44, height: 44 }} />
        <View style={{ flex: 1, minWidth: 0, height: 44 }}>
          <Animated.View
            pointerEvents="none"
            importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
            style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, labelStyle]}
          >
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
              {isNew ? 'New routine' : 'Edit routine'}
            </Text>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
            style={[{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }, miniStyle]}
          >
            <Text
              numberOfLines={1}
              style={{ maxWidth: '100%', color: colors.text, fontSize: 19, lineHeight: 23, fontWeight: '800' }}
            >
              {title}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, lineHeight: 18, fontWeight: '700' }}>
              {countLine}
            </Text>
          </Animated.View>
        </View>
        <View style={{ width: 44, height: 44 }}>
          {canRun ? (
            <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(75)}>
              <IconButton
                label="Start a run"
                testID="bar-play"
                onPress={onPlay}
                style={{ backgroundColor: colors.surface, boxShadow: '0 2px 6px rgba(28, 48, 41, 0.14)' }}
              >
                <Icon name="playFilled" color={colors.ink} size={18} />
              </IconButton>
            </Animated.View>
          ) : null}
        </View>
        {isNew ? (
          <View style={{ width: 44, height: 44 }} />
        ) : (
          <IconButton label="Delete routine" testID="editor-delete" onPress={onDelete}>
            <Icon name="trash" color={colors.text} size={22} />
          </IconButton>
        )}
      </View>
    </View>
  );
}
