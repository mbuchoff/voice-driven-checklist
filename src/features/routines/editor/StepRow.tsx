import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { STEP_MAKE_ROOM, STEP_REORDER_HOLD_MS } from '../useStepReorder';
import { formatTimerLong, formatTimerWords } from '../timers';
import { CSS_EASE } from './motion';
import { makeGlide, STEP_WORDS, WordGlide, WordLayouts, type WordSpots } from './StepWordGlide';
import type { WordSpot } from './wordGlidePlan';

/** A swipe starts after this much mostly-sideways movement. */
const SWIPE_START = 8;
/** Released past this share of the row's width, a swiped step is deleted. */
export const SWIPE_DELETE_SHARE = 0.4;
const SWIPE_MS = 200;
/** The row is removed once it has flown off. */
const FLING_MS = 220;
/** How fast the number and time move when a step opens or closes. */
const OPEN_MS = 220;
/** The time badge's look, shared with the hidden copy that measures it. */
const TIME_BADGE = {
  height: 34,
  paddingHorizontal: 8,
  borderRadius: 20,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
} as const;
/** Where an open step's words sit from the row's edge. */
export const EDIT_INSET = 18;
/** How far the text box's left edge moves when a step opens (the number's place closes). */
const OPEN_BOX_SHIFT = EDIT_INSET - 22 - 30;
/** The step's own text steps aside, unseen, while its words glide (it keeps focus). */
const UNDER_GLIDE = { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 } as const;

export type StepRowProps = {
  colors: EditorColors;
  index: number;
  /** The number shown in the badge (it follows a dragged step's position). */
  number: number;
  localId: string;
  text: string;
  timerSeconds: number | null;
  open: boolean;
  first: boolean;
  /** The step being dragged: its slot stands in for it while it's held. */
  hidden: boolean;
  /**
   * Another step is being dragged: this one glides when it moves to make
   * room. Never the dragged step, which would otherwise fly to where it lands.
   */
  makesRoom: boolean;
  holdGesture: GestureType;
  inputRef: (input: ComponentRef<typeof TextInput> | null) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  onOpen: () => void;
  onChangeText: (text: string) => void;
  onEnter: () => void;
  onBlur: () => void;
  onDelete: (height: number) => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
  /** The step's timer chips, folded open under its words while it's open. */
  chips: ReactNode;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function StepRow(props: StepRowProps) {
  const {
    colors, index, number, localId, text, timerSeconds, open, first,
    hidden, holdGesture, makesRoom,
  } = props;
  const rowWidth = useSharedValue(0);
  const rowHeight = useRef(0);
  const translateX = useSharedValue(0);
  const swipeDirection = useSharedValue(0);
  const openProgress = useSharedValue(open ? 1 : 0);
  const timeWidth = useSharedValue(0);
  // Also as state: the words are measured again once the time's width is known.
  const [timeBadgeWidth, setTimeBadgeWidth] = useState(0);
  // The text box's width with the step closed, and a glide of its words
  // when it opens or closes and they change lines (Round 27). The words are
  // measured ahead of time, while the row is at rest, so a glide starts with
  // the number and time.
  const [closedBoxWidth, setClosedBoxWidth] = useState(0);
  const openedRoom = () => -OPEN_BOX_SHIFT + (timerSeconds ? timeBadgeWidth + 8 : 0);
  const words = text.trim();
  const layoutsKey = `${closedBoxWidth}|${openedRoom()}|${words}`;
  const measured = useRef<{ key: string; closed: WordSpot[]; opened: WordSpot[] } | null>(null);
  const [glide, setGlide] = useState<{ id: number; target: 0 | 1; spots?: WordSpots } | null>(null);
  const glideCount = useRef(0);
  // The glide starts in the very render where the step opens or closes, so no
  // frame shows the step's own text re-split before it.
  const [glideFor, setGlideFor] = useState(open);
  if (open !== glideFor) {
    setGlideFor(open);
    glideCount.current += 1;
    const target = open ? 1 : 0;
    const ready = measured.current?.key === layoutsKey ? measured.current : null;
    const spots = ready
      ? (target === 1 ? { before: ready.closed, after: ready.opened } : { before: ready.opened, after: ready.closed })
      : undefined;
    // Without words or a measured box, or measured with no word changing
    // lines, the words just ride along.
    const rides = !words || !closedBoxWidth || (spots && !makeGlide(spots, target === 1 ? OPEN_BOX_SHIFT : -OPEN_BOX_SHIFT));
    setGlide(rides ? null : { id: glideCount.current, target, spots });
  }
  const endGlide = () => setGlide(null);

  useEffect(() => {
    openProgress.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: CSS_EASE });
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
  const badgeSlotStyle = useAnimatedStyle(() => ({
    width: 30 * (1 - openProgress.value),
    marginRight: (EDIT_INSET - 22) * openProgress.value,
  }));
  // The number shrinks away toward its left edge.
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: 1 - openProgress.value,
    transform: [{ scale: 1 - 0.8 * openProgress.value }],
  }));
  // The time shrinks away toward its right edge while its step is open, as
  // the number does toward its left, and its place closes up (with the row's
  // gap before it) to give the words its room.
  const timeSlotStyle = useAnimatedStyle(() => {
    const width = timeWidth.value;
    return {
      width: width > 0 ? width * (1 - openProgress.value) : openProgress.value > 0 ? 0 : undefined,
      marginLeft: -8 * openProgress.value,
    };
  });
  const timeStyle = useAnimatedStyle(() => ({
    width: timeWidth.value > 0 ? timeWidth.value : undefined,
    opacity: 1 - openProgress.value,
    transform: [{ scale: 1 - 0.8 * openProgress.value }],
  }));

  return (
    <Animated.View
      testID={`item-row-${index}`}
      nativeID={localId}
      onLayout={(event) => {
        rowHeight.current = event.nativeEvent.layout.height;
        rowWidth.value = event.nativeEvent.layout.width;
        props.onLayout(event);
      }}
      layout={makesRoom ? STEP_MAKE_ROOM : undefined}
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
                  <Text style={{ color: colors.ink, fontSize: 15, fontWeight: '800' }}>{number}</Text>
                </Animated.View>
              </Animated.View>
              <View
                testID={`item-textbox-${index}`}
                style={{ flex: 1, minWidth: 0 }}
                onLayout={(event) => {
                  // Only at rest: while the number and time move, it's changing.
                  if (Math.abs(openProgress.value - (open ? 1 : 0)) > 0.001) return;
                  const width = event.nativeEvent.layout.width;
                  const closed = open ? width - openedRoom() : width;
                  if (Math.abs(closed - closedBoxWidth) > 0.5) setClosedBoxWidth(closed);
                }}
              >
                {!glide && words && closedBoxWidth ? (
                  <WordLayouts
                    key={layoutsKey}
                    index={index}
                    text={words}
                    widths={[closedBoxWidth, closedBoxWidth + openedRoom()]}
                    names={['closed', 'opened']}
                    onMeasured={(closed, opened) => {
                      measured.current = { key: layoutsKey, closed, opened };
                    }}
                  />
                ) : null}
                {glide ? (
                  <WordGlide
                    key={glide.id}
                    index={index}
                    text={text}
                    color={colors.text}
                    fromWidth={closedBoxWidth + (glide.target === 1 ? 0 : openedRoom())}
                    toWidth={closedBoxWidth + (glide.target === 1 ? openedRoom() : 0)}
                    boxShift={glide.target === 1 ? OPEN_BOX_SHIFT : -OPEN_BOX_SHIFT}
                    progress={openProgress}
                    target={glide.target}
                    spots={glide.spots}
                    onDone={endGlide}
                  />
                ) : null}
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
                    textBreakStrategy="simple"
                    style={[
                      {
                        color: colors.text,
                        paddingHorizontal: 6,
                        paddingVertical: 11,
                        ...STEP_WORDS,
                      },
                      glide ? UNDER_GLIDE : null,
                    ]}
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
                    textBreakStrategy="simple"
                    style={[
                      {
                        color: text.trim() ? colors.text : colors.muted,
                        paddingHorizontal: 6,
                        paddingVertical: 11,
                        ...STEP_WORDS,
                      },
                      glide ? UNDER_GLIDE : null,
                    ]}
                  >
                    {text.trim() || 'Tap to describe this step'}
                  </Text>
                )}
              </View>
            </View>
          </GestureDetector>
          {timerSeconds ? (
            <Animated.View
              style={[
                { height: 34, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
                timeSlotStyle,
              ]}
            >
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width;
                  timeWidth.value = width;
                  if (Math.abs(width - timeBadgeWidth) > 0.5) setTimeBadgeWidth(width);
                }}
                style={[TIME_BADGE, { position: 'absolute', opacity: 0 }]}
              >
                <TimeLabel colors={colors} seconds={timerSeconds} />
              </View>
              <AnimatedPressable
                testID={`item-clock-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Timer for step ${number}: ${formatTimerWords(timerSeconds)}`}
                accessibilityElementsHidden={open}
                importantForAccessibility={open ? 'no-hide-descendants' : 'yes'}
                pointerEvents={open ? 'none' : 'auto'}
                onPress={props.onOpen}
                hitSlop={{ top: 7, bottom: 7 }}
                style={[
                  TIME_BADGE,
                  { flexShrink: 0, backgroundColor: colors.fill, transformOrigin: 'right center' },
                  timeStyle,
                ]}
              >
                <TimeLabel colors={colors} seconds={timerSeconds} />
              </AnimatedPressable>
            </Animated.View>
          ) : null}
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
    </Animated.View>
  );
}

function TimeLabel({ colors, seconds }: { colors: EditorColors; seconds: number }) {
  return (
    <>
      <Icon name="clock" color={colors.ink} size={15} strokeWidth={2.5} />
      <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 15, fontWeight: '800' }}>
        {formatTimerLong(seconds)}
      </Text>
    </>
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
    if (closing) progress.value = withTiming(0, { duration: CLOSE_UP_MS, easing: CSS_EASE });
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
