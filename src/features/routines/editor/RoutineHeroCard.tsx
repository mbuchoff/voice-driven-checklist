import { forwardRef } from 'react';
import { Pressable, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { ColorDot, ColorGrid } from './ColorGrid';
import { IconButton } from './EditorTopBar';

/**
 * The routine's card, live: its color, name, count and ▶. The dot swaps the
 * name for the colors until one is picked.
 */
export const RoutineHeroCard = forwardRef<TextInput, {
  colors: EditorColors;
  title: string;
  countLine: string;
  colorKey: string;
  colorLabel: string;
  colorsOpen: boolean;
  playDisabled: boolean;
  onChangeTitle: (title: string) => void;
  onTitleFocus: () => void;
  onOpenColors: () => void;
  onCloseColors: () => void;
  onPickColor: (key: string) => void;
  onPlay: () => void;
  onTitleRowLayout: (event: LayoutChangeEvent) => void;
}>(function RoutineHeroCard(props, ref) {
  const { colors } = props;
  return (
    <View
      testID="routine-hero-card"
      style={{
        paddingTop: 18,
        paddingHorizontal: 18,
        paddingBottom: 14,
        borderRadius: 24,
        backgroundColor: colors.fill,
        boxShadow: `0 2px 8px ${colors.shadow}`,
        gap: 4,
      }}
    >
      <Text style={{ color: colors.ink, fontSize: 11, lineHeight: 13, fontWeight: '800', letterSpacing: 1.5 }}>
        SHAPE THE ROUTINE
      </Text>
      {props.colorsOpen ? (
        <IconButton
          label="Close colors"
          testID="hero-colors-close"
          onPress={props.onCloseColors}
          style={{ position: 'absolute', top: 4, right: 6 }}
        >
          <Icon name="close" color={colors.muted} size={18} />
        </IconButton>
      ) : null}
      <View
        onLayout={props.onTitleRowLayout}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
      >
        {props.colorsOpen ? (
          <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <ColorGrid colors={colors} selected={props.colorKey} onPick={props.onPickColor} />
          </View>
        ) : (
          <>
            <TextInput
              ref={ref}
              testID="title-input"
              accessibilityLabel="Routine name"
              value={props.title}
              onChangeText={props.onChangeTitle}
              onFocus={props.onTitleFocus}
              placeholder="Name this routine"
              placeholderTextColor={colors.muted2}
              returnKeyType="done"
              style={{
                flex: 1,
                minWidth: 0,
                color: colors.text,
                fontSize: 30,
                lineHeight: 36,
                fontWeight: '800',
                letterSpacing: -1,
                paddingVertical: 2,
                paddingHorizontal: 0,
              }}
            />
            <ColorDot
              colors={colors}
              size={30}
              rim={3}
              label={`Card color: ${props.colorLabel}. Change it`}
              testID="hero-color-dot"
              onPress={props.onOpenColors}
            />
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text testID="hero-count" style={{ color: colors.ink, fontSize: 14, lineHeight: 16, fontWeight: '700' }}>
          {props.countLine}
        </Text>
        <Pressable
          testID="hero-play"
          accessibilityRole="button"
          accessibilityLabel="Save and start a run"
          accessibilityState={{ disabled: props.playDisabled }}
          disabled={props.playDisabled}
          onPress={props.onPlay}
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: colors.surface,
            boxShadow: '0 3px 10px rgba(28, 48, 41, 0.16)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: props.playDisabled ? 0.4 : 1,
          }}
        >
          <Icon name="playFilled" color={colors.ink} size={22} />
        </Pressable>
      </View>
    </View>
  );
});
