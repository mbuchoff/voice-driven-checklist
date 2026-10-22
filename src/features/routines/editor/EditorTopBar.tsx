import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { ColorDot, ColorGrid } from './ColorGrid';

const FOLD_MS = 180;

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
  children: React.ReactNode;
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

/**
 * Back, the title, and (for an existing routine) Delete. Once the name
 * scrolls under it, the bar folds into the card: it takes the routine's
 * color and shows its dot, title, count and ▶.
 */
export function EditorTopBar({
  colors,
  collapsed,
  isNew,
  title,
  countLine,
  colorLabel,
  colorKey,
  colorsOpen,
  canRun,
  onBack,
  onDelete,
  onPlay,
  onToggleColors,
  onPickColor,
}: {
  colors: EditorColors;
  collapsed: boolean;
  isNew: boolean;
  title: string;
  countLine: string;
  colorLabel: string;
  colorKey: string;
  colorsOpen: boolean;
  /** ▶ shows only for a saved routine with nothing unsaved that can run. */
  canRun: boolean;
  onBack: () => void;
  onDelete: () => void;
  onPlay: () => void;
  onToggleColors: () => void;
  onPickColor: (key: string) => void;
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
  const popStyle = useAnimatedStyle(() => ({
    opacity: fold.value,
    transform: [{ scale: interpolate(fold.value, [0, 1], [0.8, 1]) }],
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
        <Animated.View
          pointerEvents={collapsed ? 'auto' : 'none'}
          style={[{ width: 44, height: 44 }, popStyle]}
        >
          <ColorDot
            colors={colors}
            size={24}
            rim={2.5}
            label={`Card color: ${colorLabel}. Change it`}
            expanded={colorsOpen}
            testID="bar-color-dot"
            onPress={onToggleColors}
          />
        </Animated.View>
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
              style={{ maxWidth: '100%', color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '800' }}
            >
              {title.trim() || 'Untitled routine'}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 12, lineHeight: 14, fontWeight: '700' }}>
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
      {collapsed && colorsOpen ? (
        <View
          testID="bar-color-strip"
          style={{
            position: 'absolute',
            top: 60,
            left: 0,
            right: 0,
            paddingTop: 6,
            paddingHorizontal: 12,
            paddingBottom: 10,
            alignItems: 'center',
            backgroundColor: colors.fill,
            borderBottomLeftRadius: 18,
            borderBottomRightRadius: 18,
            boxShadow: `0 6px 12px ${colors.shadow}`,
          }}
        >
          <ColorGrid colors={colors} selected={colorKey} onPick={onPickColor} columnSpace={52} />
        </View>
      ) : null}
    </View>
  );
}
