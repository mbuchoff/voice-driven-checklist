import type { ComponentProps } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';

import { Icon } from '@/src/components/Icon';
import type { Palette } from '@/src/theme/palette';

import type { RoutineGridMetrics } from './routineGrid';
import type { ChecklistSummary } from './types';
import { useRoutineSelectionFeedback } from './useRoutineSelectionFeedback';

const cardPalette = {
  light: {
    fills: ['#dcebe3', '#f7dfd5', '#dceaf0', '#e9e1f0', '#e8ebd7'],
    inks: ['#2c5a47', '#a04a30', '#325f73', '#63508a', '#5c6636'],
  },
  dark: {
    fills: ['#223c33', '#392b27', '#20343d', '#332d40', '#29372a'],
    inks: ['#9dceb7', '#f1a48c', '#98c7d8', '#c3add8', '#c3ce99'],
  },
} as const;

function paletteIndex(id: string, length: number) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100000;
  }
  return hash % length;
}

export function getRoutineCardColors(
  id: string,
  mode: Palette['mode'],
) {
  const palette = cardPalette[mode];
  const colorIndex = paletteIndex(id, palette.inks.length);
  return {
    fill: palette.fills[colorIndex],
    ink: palette.inks[colorIndex],
  };
}

function stepCountLabel(count: number) {
  return count === 1 ? '1 step' : `${count} steps`;
}

export function RoutineCard({
  item,
  layout,
  theme,
  onEdit,
  onStart,
  gesture,
  accessibilityActions,
  onAccessibilityAction,
}: {
  item: ChecklistSummary;
  layout: RoutineGridMetrics;
  theme: Palette;
  onEdit: () => void;
  onStart: () => void;
  gesture?: GestureType;
  accessibilityActions?: ComponentProps<typeof Pressable>['accessibilityActions'];
  onAccessibilityAction?: ComponentProps<typeof Pressable>['onAccessibilityAction'];
}) {
  const { ink, fill } = getRoutineCardColors(item.id, theme.mode);
  const empty = item.itemCount === 0;
  const cardSelection = useRoutineSelectionFeedback('card', onEdit);
  const playSelection = useRoutineSelectionFeedback('control', onStart);

  const cardBody = (
    <Pressable
      testID={`routine-card-action-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.title}`}
      accessibilityHint="Opens this routine for editing."
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={cardSelection.run}
      style={{
        flex: 1,
        padding: 15,
        paddingBottom: layout.contentBottomPadding,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: fill,
      }}
    >
      <View
        testID={`routine-card-content-${item.id}`}
        style={{
          flex: 1,
          justifyContent: 'flex-start',
          overflow: 'hidden',
        }}
      >
        <Text
          style={{
            color: theme.text,
            fontSize: layout.compact ? 14 : 18,
            lineHeight: layout.compact ? 18 : 22,
            fontWeight: '800',
            letterSpacing: layout.compact ? -0.35 : -0.6,
          }}
        >
          {item.title}
        </Text>
        <Text
          style={{
            color: ink,
            fontSize: layout.compact ? 11 : 12,
            fontWeight: '700',
            marginTop: layout.compact ? 4 : 5,
          }}
        >
          {stepCountLabel(item.itemCount)}
        </Text>
        {item.items.length > 0 ? (
          <Text
            testID={`routine-step-list-${item.id}`}
            style={{
              color: theme.textMuted,
              fontSize: layout.compact ? 10 : 11,
              lineHeight: layout.compact ? 13 : 15,
              marginTop: layout.compact ? 6 : 8,
              paddingTop: layout.compact ? 6 : 8,
              borderTopWidth: 1,
              borderTopColor: 'rgba(128, 128, 128, 0.22)',
            }}
          >
            {item.items.map(({ text }) => text).join(' · ')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <Animated.View
      testID={`routine-card-${item.id}`}
      style={{
        width: layout.cardWidth,
        height: layout.cardHeight,
        borderRadius: 22,
        backgroundColor: fill,
        boxShadow: `0 2px 8px ${theme.shadow}`,
        transform: [
          { translateY: cardSelection.translateY },
          { scale: cardSelection.scale },
        ],
      }}
    >
      {gesture ? (
        <GestureDetector gesture={gesture}>{cardBody}</GestureDetector>
      ) : (
        cardBody
      )}
      <Animated.View
        testID={`routine-play-feedback-${item.id}`}
        style={{
          position: 'absolute',
          width: layout.playButtonSize,
          height: layout.playButtonSize,
          borderRadius: layout.playButtonSize / 2,
          right: layout.playButtonInset,
          bottom: layout.playButtonInset,
          backgroundColor: theme.surface,
          opacity: empty ? 0.62 : 1,
          boxShadow: `0 3px 10px ${theme.shadow}`,
          transform: [
            { translateY: playSelection.translateY },
            { scale: playSelection.scale },
          ],
        }}
      >
        <Pressable
          testID={`start-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Start ${item.title}`}
          accessibilityState={{ disabled: empty }}
          disabled={empty}
          onPress={playSelection.run}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon
            name="play"
            color={empty ? theme.disabled : ink}
            size={layout.compact ? 19 : 22}
          />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
