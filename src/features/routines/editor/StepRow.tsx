import { useEffect, useState, type ComponentRef, type ReactNode } from 'react';
import { Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { CSS_EASE, STEP_MAKE_ROOM, STEP_OPEN_MS } from '../motion';
import { STEP_REORDER_HOLD_MS } from '../useStepReorder';
import { NumberBadge } from './NumberBadge';
import {
  BADGE_SIZE,
  OPEN_BADGE_MARGIN,
  OPEN_BOX_SHIFT,
  ROW_BLEED,
  ROW_GAP,
  ROW_PAD_X,
  ROW_PAD_Y,
  STEP_TEXT_BOX,
} from './stepRowMetrics';
import { useWordGlide } from './StepWordGlide';
import { TimeBadge } from './TimeBadge';
import { useStepSwipe } from './useStepSwipe';

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

export function StepRow(props: StepRowProps) {
  const {
    colors, index, number, localId, text, timerSeconds, open, first,
    hidden, holdGesture, makesRoom,
  } = props;
  const openProgress = useSharedValue(open ? 1 : 0);
  const [timeBadgeWidth, setTimeBadgeWidth] = useState(0);
  // The text box's width with the step closed, measured at rest.
  // The time's place, with the row's gap before it.
  const timeRoom = timerSeconds ? timeBadgeWidth + ROW_GAP : 0;
  // The room an open step's words gain: the number's place, and the time's.
  const openedRoom = () => -OPEN_BOX_SHIFT + timeRoom;
  // The text box's width as last measured at rest, with the time's place
  // then. Its closed width follows from that, so it stays right when the
  // step gets (or loses) a timer while it's open, with no new measurement.
  const [boxAtRest, setBoxAtRest] = useState({ width: 0, open: false, timeRoom: 0 });
  const closedWidthFrom = (box: typeof boxAtRest) =>
    box.open ? box.width + OPEN_BOX_SHIFT - timeRoom : box.width + box.timeRoom - timeRoom;
  const closedBoxWidth = closedWidthFrom(boxAtRest);
  const { glide, textHidden } = useWordGlide({
    index,
    open,
    text,
    color: colors.text,
    closedBoxWidth,
    openedBoxWidth: closedBoxWidth + openedRoom(),
    progress: openProgress,
  });

  useEffect(() => {
    openProgress.value = withTiming(open ? 1 : 0, { duration: STEP_OPEN_MS, easing: CSS_EASE });
  }, [open, openProgress]);

  const swipe = useStepSwipe({
    testId: `step-swipe-gesture-${localId}-${index}`,
    enabled: !open,
    onDelete: props.onDelete,
  });

  const tap = Gesture.Tap()
    .withTestId(`step-edit-gesture-${localId}-${index}`)
    .enabled(!open)
    .maxDuration(STEP_REORDER_HOLD_MS - 1)
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success) props.onOpen();
    });

  const rowGesture = Gesture.Race(swipe.gesture, holdGesture, tap);

  const badgeSlotStyle = useAnimatedStyle(() => ({
    width: BADGE_SIZE * (1 - openProgress.value),
    marginRight: OPEN_BADGE_MARGIN * openProgress.value,
  }));
  // The number shrinks away toward its left edge.
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: 1 - openProgress.value,
    transform: [{ scale: 1 - 0.8 * openProgress.value }],
  }));

  return (
    <Animated.View
      testID={`step-row-${index}`}
      nativeID={localId}
      onLayout={(event) => {
        swipe.measure(event);
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
        {([['left', swipe.leftSide], ['right', swipe.rightSide]] as const).map(([side, style]) => (
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
            marginHorizontal: -ROW_BLEED,
            paddingVertical: ROW_PAD_Y,
            paddingHorizontal: ROW_PAD_X,
            borderRadius: 16,
            backgroundColor: open ? colors.editTint : colors.surface,
            justifyContent: 'center',
          },
          swipe.frontStyle,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: ROW_GAP }}>
          <GestureDetector gesture={rowGesture}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP }}>
              <Animated.View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={[{ alignItems: 'flex-start', justifyContent: 'center' }, badgeSlotStyle]}
              >
                <NumberBadge
                  number={number}
                  color={colors.ink}
                  background={open ? colors.surface : colors.fill}
                  style={[{ transformOrigin: 'left center' }, badgeStyle]}
                />
              </Animated.View>
              <View
                testID={`step-textbox-${index}`}
                style={{ flex: 1, minWidth: 0 }}
                onLayout={(event) => {
                  // Only at rest: while the number and time move, it's changing.
                  if (Math.abs(openProgress.value - (open ? 1 : 0)) > 0.001) return;
                  const box = { width: event.nativeEvent.layout.width, open, timeRoom };
                  // Within half a point, the words aren't measured again for nothing.
                  if (Math.abs(closedWidthFrom(box) - closedBoxWidth) > 0.5) setBoxAtRest(box);
                }}
              >
                {glide}
                {open ? (
                  <TextInput
                    ref={props.inputRef}
                    testID={`step-text-${index}`}
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
                    style={[STEP_TEXT_BOX, { color: colors.text }, textHidden ? UNDER_GLIDE : null]}
                  />
                ) : (
                  <Text
                    testID={`step-label-${index}`}
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
                        case 'delete': swipe.deleteRow(); break;
                      }
                    }}
                    textBreakStrategy="simple"
                    style={[
                      STEP_TEXT_BOX,
                      { color: text.trim() ? colors.text : colors.muted },
                      textHidden ? UNDER_GLIDE : null,
                    ]}
                  >
                    {text.trim() || 'Tap to describe this step'}
                  </Text>
                )}
              </View>
            </View>
          </GestureDetector>
          {timerSeconds ? (
            <TimeBadge
              colors={colors}
              seconds={timerSeconds}
              open={open}
              stepNumber={number}
              index={index}
              progress={openProgress}
              onPress={props.onOpen}
              onWidth={setTimeBadgeWidth}
            />
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
