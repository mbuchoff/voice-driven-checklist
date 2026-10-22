import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { STEP_REORDER_HOLD_MS } from '../useStepReorder';
import { formatTimerShort, formatTimerWords } from '../timers';

/** A swipe starts after this much mostly-sideways movement. */
const SWIPE_START = 8;
/** Released past this share of the row's width, a swiped step is deleted. */
export const SWIPE_DELETE_SHARE = 0.4;
const SWIPE_MS = 200;
/** The row is removed once it has flown off. */
const FLING_MS = 220;
/** How fast the number, grip and ✓ move when a step opens or closes. */
const OPEN_MS = 220;
/** Where an open step's words sit from the row's edge. */
export const EDIT_INSET = 18;

export type StepRowProps = {
  colors: EditorColors;
  index: number;
  /** The number shown in the badge (it follows a dragged step's position). */
  number: number;
  localId: string;
  text: string;
  timerSeconds: number | null;
  open: boolean;
  chipsOpen: boolean;
  first: boolean;
  hidden: boolean;
  holdGesture: GestureType;
  gripGesture: GestureType;
  inputRef: (input: ComponentRef<typeof TextInput> | null) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onOpen: () => void;
  onChangeText: (text: string) => void;
  onEnter: () => void;
  onBlur: () => void;
  onClock: () => void;
  onDone: () => void;
  onDelete: (height: number) => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  /** The step's timer chips, folded open under the row by its clock. */
  chips: ReactNode;
};

export function StepRow(props: StepRowProps) {
  const {
    colors, index, number, localId, text, timerSeconds, open, chipsOpen, first,
    hidden, holdGesture, gripGesture,
  } = props;
  const rowWidth = useSharedValue(0);
  const rowHeight = useRef(0);
  const translateX = useSharedValue(0);
  const swipeDirection = useSharedValue(0);
  const openProgress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    openProgress.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: Easing.ease });
  }, [open, openProgress]);

  const deleteRow = () => props.onDelete(rowHeight.current);
  const deleteAfterFling = () => {
    setTimeout(deleteRow, FLING_MS);
  };

  const swipe = Gesture.Pan()
    .withTestId(`item-swipe-gesture-${localId}-${index}`)
    .enabled(!open)
    .activeOffsetX([-SWIPE_START, SWIPE_START])
    .failOffsetY([-SWIPE_START, SWIPE_START])
    .onUpdate((event) => {
      'worklet';
      // Android's first update after the swipe starts reports no movement,
      // so the direction locks on the first update that has some.
      if (swipeDirection.value === 0) {
        if (event.translationX === 0) return;
        swipeDirection.value = event.translationX < 0 ? -1 : 1;
      }
      // Locked to the first direction: moving back past the start stops at 0.
      const along = event.translationX * swipeDirection.value;
      translateX.value = swipeDirection.value * Math.min(rowWidth.value, Math.max(0, along));
    })
    .onEnd(() => {
      'worklet';
      const width = rowWidth.value;
      if (width > 0 && Math.abs(translateX.value) > width * SWIPE_DELETE_SHARE) {
        translateX.value = withTiming(swipeDirection.value * (width + 40), { duration: SWIPE_MS });
        scheduleOnRN(deleteAfterFling);
      } else {
        translateX.value = withTiming(0, { duration: SWIPE_MS });
      }
    })
    .onFinalize(() => {
      'worklet';
      swipeDirection.value = 0;
    });

  const tap = Gesture.Tap()
    .withTestId(`item-edit-gesture-${localId}-${index}`)
    .enabled(!open)
    .maxDuration(STEP_REORDER_HOLD_MS - 1)
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success) props.onOpen();
    });

  const rowGesture = Gesture.Race(swipe, holdGesture, tap);

  const frontStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  // "Delete" shows on the side the row moves away from.
  const leftSide = useAnimatedStyle(() => ({ opacity: translateX.value > 0 ? 1 : 0 }));
  const rightSide = useAnimatedStyle(() => ({ opacity: translateX.value < 0 ? 1 : 0 }));
  const gripStyle = useAnimatedStyle(() => ({
    width: 24 * (1 - openProgress.value),
    marginLeft: -8 * (1 - openProgress.value),
    marginRight: -4 - 4 * openProgress.value,
    opacity: 1 - openProgress.value,
  }));
  const badgeSlotStyle = useAnimatedStyle(() => ({
    width: 30 * (1 - openProgress.value),
    marginRight: (EDIT_INSET - 22) * openProgress.value,
  }));
  // The number shrinks away toward its left edge.
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: 1 - openProgress.value,
    transform: [{ scale: 1 - 0.8 * openProgress.value }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    width: 40 * openProgress.value,
    marginLeft: -8 * (1 - openProgress.value),
    opacity: openProgress.value,
    transform: [{ scale: 0.5 + 0.5 * openProgress.value }],
  }));

  const timed = !!timerSeconds;
  const clockLabel = timed
    ? `Timer for step ${number}: ${formatTimerWords(timerSeconds)}`
    : `Add a timer to step ${number}`;

  return (
    <View
      testID={`item-row-${index}`}
      nativeID={localId}
      onLayout={(event) => {
        rowHeight.current = event.nativeEvent.layout.height;
        rowWidth.value = event.nativeEvent.layout.width;
        props.onLayout(event);
      }}
      style={{
        position: hidden ? 'absolute' : 'relative',
        opacity: hidden ? 0 : 1,
        left: 0,
        right: 0,
        overflow: 'hidden',
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.divider,
      }}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.danger }}
      >
        {([['left', leftSide], ['right', rightSide]] as const).map(([side, style]) => (
          <Animated.View
            key={side}
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                [side]: 0,
                width: 88,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              },
              style,
            ]}
          >
            <Icon name="trash" color={colors.onDanger} size={18} />
            <Text style={{ color: colors.onDanger, fontSize: 12, fontWeight: '800' }}>Delete</Text>
          </Animated.View>
        ))}
      </View>
      <Animated.View
        style={[
          {
            minHeight: 56,
            marginHorizontal: -16,
            paddingVertical: 6,
            paddingHorizontal: 24,
            borderRadius: 16,
            backgroundColor: open ? colors.editTint : colors.surface,
            justifyContent: 'center',
          },
          frontStyle,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GestureDetector gesture={gripGesture}>
            <Animated.View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[{ alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, gripStyle]}
            >
              <Icon name="grip" color={colors.muted2} size={22} />
            </Animated.View>
          </GestureDetector>
          <GestureDetector gesture={rowGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Animated.View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={[{ alignItems: 'flex-start', justifyContent: 'center' }, badgeSlotStyle]}
              >
                <Animated.View
                  style={[
                    {
                      width: 30,
                      height: 30,
                      borderTopLeftRadius: 10,
                      borderTopRightRadius: 10,
                      borderBottomRightRadius: 10,
                      borderBottomLeftRadius: 4,
                      backgroundColor: open ? colors.surface : colors.fill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transformOrigin: 'left center',
                    },
                    badgeStyle,
                  ]}
                >
                  <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>{number}</Text>
                </Animated.View>
              </Animated.View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {open ? (
                  <TextInput
                    ref={props.inputRef}
                    testID={`item-text-${index}`}
                    accessibilityLabel={`Step ${number}`}
                    value={text}
                    multiline
                    scrollEnabled={false}
                    submitBehavior="submit"
                    returnKeyType="done"
                    onSubmitEditing={props.onEnter}
                    onChangeText={props.onChangeText}
                    onBlur={props.onBlur}
                    placeholder="Describe this step"
                    placeholderTextColor={colors.muted}
                    textAlignVertical="center"
                    style={{
                      color: colors.text,
                      paddingHorizontal: 6,
                      paddingVertical: 11,
                      fontSize: 16,
                      lineHeight: 21,
                    }}
                  />
                ) : (
                  <Text
                    testID={`item-label-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit step ${number}: ${text}`}
                    accessibilityActions={[
                      { name: 'activate', label: 'Edit step' },
                      { name: 'moveEarlier', label: 'Move earlier' },
                      { name: 'moveLater', label: 'Move later' },
                      { name: 'delete', label: 'Delete step' },
                    ]}
                    onAccessibilityAction={(event) => {
                      switch (event.nativeEvent.actionName) {
                        case 'activate': props.onOpen(); break;
                        case 'moveEarlier': props.onMoveEarlier(); break;
                        case 'moveLater': props.onMoveLater(); break;
                        case 'delete': deleteRow(); break;
                      }
                    }}
                    style={{
                      color: text.trim() ? colors.text : colors.muted,
                      paddingHorizontal: 6,
                      paddingVertical: 11,
                      fontSize: 16,
                      lineHeight: 21,
                    }}
                  >
                    {text.trim() || 'Tap to describe this step'}
                  </Text>
                )}
              </View>
            </View>
          </GestureDetector>
          <Pressable
            testID={`item-clock-${index}`}
            accessibilityRole="button"
            accessibilityLabel={clockLabel}
            accessibilityState={{ expanded: chipsOpen }}
            onPress={props.onClock}
            hitSlop={timed ? { top: 7, bottom: 7 } : undefined}
            style={{
              height: timed ? 30 : 40,
              minWidth: timed ? 0 : 40,
              paddingHorizontal: 8,
              borderRadius: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              backgroundColor: chipsOpen ? colors.surface : timed ? colors.fill : 'transparent',
              borderWidth: chipsOpen ? 1.5 : 0,
              borderColor: colors.ink,
            }}
          >
            <Icon
              name="clock"
              color={chipsOpen || timed ? colors.ink : colors.muted}
              size={timed ? 13 : 16}
              strokeWidth={timed ? 2.5 : 2}
            />
            {timed ? (
              <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '800' }}>
                {formatTimerShort(timerSeconds)}
              </Text>
            ) : null}
          </Pressable>
          <Animated.View style={[{ height: 40, overflow: 'hidden' }, checkStyle]}>
            <Pressable
              testID={`item-done-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Done editing step ${number}`}
              accessibilityElementsHidden={!open}
              importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
              disabled={!open}
              onPress={props.onDone}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.ink,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="check" color={colors.onInk} size={18} strokeWidth={2.6} />
            </Pressable>
          </Animated.View>
        </View>
        {props.chips}
      </Animated.View>
      {open ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 4,
            borderTopRightRadius: 3,
            borderBottomRightRadius: 3,
            backgroundColor: colors.ink,
          }}
        />
      ) : null}
    </View>
  );
}

const CLOSE_UP_MS = 260;

/** The place a swiped-away step leaves, with UNDO, at the step's height. */
export function DeletedStepRow({
  colors,
  height,
  first,
  closing,
  onUndo,
  index,
}: {
  colors: EditorColors;
  height: number;
  first: boolean;
  closing: boolean;
  onUndo: () => void;
  index: number;
}) {
  const progress = useSharedValue(1);
  useEffect(() => {
    if (closing) progress.value = withTiming(0, { duration: CLOSE_UP_MS, easing: Easing.ease });
  }, [closing, progress]);
  const style = useAnimatedStyle(() => ({
    height: Math.max(52, height) * progress.value,
    opacity: progress.value,
  }));
  return (
    <Animated.View
      testID={`deleted-step-${index}`}
      accessibilityLiveRegion="polite"
      style={[
        {
          overflow: 'hidden',
          borderTopWidth: first ? 0 : 1,
          borderTopColor: colors.divider,
          backgroundColor: colors.surfaceSoft,
          paddingLeft: 16,
          paddingRight: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        style,
      ]}
    >
      <Text style={{ flex: 1, color: colors.muted, fontSize: 14 }}>Step deleted</Text>
      <Pressable
        testID={`undo-step-${index}`}
        accessibilityRole="button"
        accessibilityLabel="Undo deleting this step"
        onPress={onUndo}
        style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '800', letterSpacing: 0.3 }}>
          UNDO
        </Text>
      </Pressable>
    </Animated.View>
  );
}
