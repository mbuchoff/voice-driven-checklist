import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  AppState,
  BackHandler,
  ScrollView,
  Vibration,
  View,
} from 'react-native';
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  measure,
  scrollTo,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import type { Palette } from '@/src/theme/palette';

import { moveItem } from './reorder';
import { getRoutineCardColors, RoutineCard } from './RoutineCard';
import {
  getRoutinePosition,
  type RoutineGridMetrics,
} from './routineGrid';
import {
  getDirectionalDragTilt,
  getDisplacedRoutineSlot,
  getRoutineAutoScrollDelta,
  getRoutineRockingTilt,
  getRoutineTargetIndex,
  ROUTINE_AUTOSCROLL_EDGE_SIZE,
  ROUTINE_ROCKING_DURATION_MS,
} from './routineMotion';
import type { ChecklistSummary } from './types';

type SlotMap = Record<string, number>;

export const ROUTINE_REORDER_TIMING = {
  feedbackDelayMs: 160,
  activationMs: 440,
  movementTolerance: 7,
} as const;

const CARD_MOVE_DURATION_MS = 190;
const RELEASE_DURATION_MS = 120;
const SWAY_RESPONSE_MS = 72;
const MAX_TILT_DEGREES = 9;
const SETTLE_DELAY_MS = 80;
const PRESS_SUPPRESSION_MS = 400;
const MOVE_EASING = Easing.bezier(0.22, 0.75, 0.2, 1);

const AnimatedPath = Animated.createAnimatedComponent(Path);

function mapSlots(items: ChecklistSummary[]): SlotMap {
  return Object.fromEntries(items.map((item, index) => [item.id, index]));
}

function displaceSlots(
  initialSlots: SlotMap,
  from: number,
  to: number,
) {
  'worklet';
  const next: SlotMap = {};
  for (const id of Object.keys(initialSlots)) {
    next[id] = getDisplacedRoutineSlot(initialSlots[id], from, to);
  }
  return next;
}

function updateDragTarget(
  dragX: SharedValue<number>,
  dragY: SharedValue<number>,
  scrollY: SharedValue<number>,
  dragStartScrollY: SharedValue<number>,
  startX: SharedValue<number>,
  startY: SharedValue<number>,
  fromIndex: SharedValue<number>,
  targetIndex: SharedValue<number>,
  initialSlots: SharedValue<SlotMap>,
  slots: SharedValue<SlotMap>,
  layout: RoutineGridMetrics,
  itemCount: number,
) {
  'worklet';
  const centerX = startX.value + layout.cardWidth / 2 + dragX.value;
  const centerY =
    startY.value +
    layout.cardHeight / 2 +
    dragY.value +
    (scrollY.value - dragStartScrollY.value);
  const nextTarget = getRoutineTargetIndex(
    centerX,
    centerY,
    layout,
    itemCount,
  );
  if (nextTarget === targetIndex.value) return;
  targetIndex.value = nextTarget;
  slots.value = displaceSlots(
    initialSlots.value,
    fromIndex.value,
    nextTarget,
  );
}

function cancelRoutineDrag(
  activeId: SharedValue<string>,
  settlingId: SharedValue<string>,
  holdingIndex: SharedValue<number>,
  holdProgress: SharedValue<number>,
  slots: SharedValue<SlotMap>,
  initialSlots: SharedValue<SlotMap>,
  dragX: SharedValue<number>,
  dragY: SharedValue<number>,
  dragTilt: SharedValue<number>,
  dragging: SharedValue<number>,
) {
  'worklet';
  cancelAnimation(holdProgress);
  cancelAnimation(dragX);
  cancelAnimation(dragY);
  slots.value = { ...initialSlots.value };
  activeId.value = '';
  settlingId.value = '';
  holdingIndex.value = -1;
  holdProgress.value = 0;
  dragX.value = 0;
  dragY.value = 0;
  dragTilt.value = 0;
  dragging.value = 0;
}

function RoutinePosition({
  item,
  fallbackIndex,
  layout,
  theme,
  gesture,
  activeId,
  settlingId,
  holdingIndex,
  holdProgress,
  slots,
  startX,
  startY,
  dragX,
  dragY,
  dragTilt,
  dragStartScrollY,
  scrollY,
  settleInitialTilt,
  settleProgress,
  onEdit,
  onStart,
  onMoveEarlier,
  onMoveLater,
}: {
  item: ChecklistSummary;
  fallbackIndex: number;
  layout: RoutineGridMetrics;
  theme: Palette;
  gesture: GestureType;
  activeId: SharedValue<string>;
  settlingId: SharedValue<string>;
  holdingIndex: SharedValue<number>;
  holdProgress: SharedValue<number>;
  slots: SharedValue<SlotMap>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  dragTilt: SharedValue<number>;
  dragStartScrollY: SharedValue<number>;
  scrollY: SharedValue<number>;
  settleInitialTilt: SharedValue<number>;
  settleProgress: SharedValue<number>;
  onEdit: () => void;
  onStart: () => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const positionStyle = useAnimatedStyle(() => {
    const slot = slots.value[item.id] ?? fallbackIndex;
    const destination = getRoutinePosition(slot, layout);
    const active = activeId.value === item.id;
    const settling = settlingId.value === item.id;
    const rotation = active
      ? dragTilt.value * MAX_TILT_DEGREES
      : settling
        ? getRoutineRockingTilt(
            settleInitialTilt.value,
            settleProgress.value * ROUTINE_ROCKING_DURATION_MS,
          ) * MAX_TILT_DEGREES
        : 0;
    const dimmed =
      holdingIndex.value >= 0 && holdingIndex.value !== fallbackIndex;

    return {
      zIndex: active || settling ? 20 : 1,
      elevation: active || settling ? 12 : 0,
      opacity: dimmed
        ? interpolate(holdProgress.value, [0, 1], [1, 0.58])
        : 1,
      transform: [
        {
          translateX: active
            ? startX.value + dragX.value
            : withTiming(destination.x, {
                duration: CARD_MOVE_DURATION_MS,
                easing: MOVE_EASING,
              }),
        },
        {
          translateY: active
            ? startY.value +
              dragY.value +
              (scrollY.value - dragStartScrollY.value)
            : withTiming(destination.y, {
                duration: CARD_MOVE_DURATION_MS,
                easing: MOVE_EASING,
              }),
        },
        { scale: active ? 1.045 : 1 },
        { rotate: `${rotation}deg` },
      ],
    };
  }, [fallbackIndex, item.id, layout]);

  const accessibilityActions = [
    ...(onMoveEarlier ? [{ name: 'decrement', label: 'Move earlier' }] : []),
    ...(onMoveLater ? [{ name: 'increment', label: 'Move later' }] : []),
  ];

  return (
    <Animated.View
      testID={`routine-position-${item.id}`}
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: layout.cardWidth,
          height: layout.cardHeight,
        },
        positionStyle,
      ]}
    >
      <RoutineCard
        item={item}
        layout={layout}
        theme={theme}
        gesture={gesture}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'decrement') onMoveEarlier?.();
          if (event.nativeEvent.actionName === 'increment') onMoveLater?.();
        }}
        onEdit={onEdit}
        onStart={onStart}
      />
      <RoutineHoldFeedback
        index={fallbackIndex}
        layout={layout}
        color={getRoutineCardColors(item.id, theme.mode).ink}
        holdingIndex={holdingIndex}
        progress={holdProgress}
      />
    </Animated.View>
  );
}

function RoutineDropSlot({
  layout,
  theme,
  targetIndex,
}: {
  layout: RoutineGridMetrics;
  theme: Palette;
  targetIndex: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const position = getRoutinePosition(targetIndex.value, layout);
    return {
      transform: [
        { translateX: position.x },
        { translateY: position.y },
      ],
    };
  }, [layout]);

  return (
    <Animated.View
      testID="routine-drop-slot"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: layout.cardWidth,
          height: layout.cardHeight,
          borderRadius: 22,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: theme.primary,
          backgroundColor: theme.surfaceSoft,
          opacity: 0.72,
        },
        style,
      ]}
    />
  );
}

function RoutineHoldFeedback({
  index,
  layout,
  color,
  holdingIndex,
  progress,
}: {
  index: number;
  layout: RoutineGridMetrics;
  color: string;
  holdingIndex: SharedValue<number>;
  progress: SharedValue<number>;
}) {
  const inset = 4;
  const radius = 18;
  const left = inset;
  const top = inset;
  const right = layout.cardWidth - inset;
  const bottom = layout.cardHeight - inset;
  const width = right - left;
  const height = bottom - top;
  const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
  const outline = [
    `M ${layout.cardWidth / 2} ${top}`,
    `H ${right - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right} ${top + radius}`,
    `V ${bottom - radius}`,
    `A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
    `H ${left + radius}`,
    `A ${radius} ${radius} 0 0 1 ${left} ${bottom - radius}`,
    `V ${top + radius}`,
    `A ${radius} ${radius} 0 0 1 ${left + radius} ${top}`,
    `H ${layout.cardWidth / 2}`,
    'Z',
  ].join(' ');
  const containerStyle = useAnimatedStyle(() => ({
    opacity:
      holdingIndex.value === index && progress.value > 0
        ? Math.min(1, progress.value * 10)
        : 0,
  }));
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: perimeter * (1 - progress.value),
  }));

  return (
    <Animated.View
      testID={`routine-hold-feedback-${index}`}
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: layout.cardWidth,
          height: layout.cardHeight,
          zIndex: 30,
        },
        containerStyle,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          left: 2,
          top: 2,
          right: 2,
          bottom: 2,
          borderRadius: 20,
          backgroundColor: color,
          opacity: 0.12,
        }}
      />
      <Svg
        testID="routine-hold-progress-outline"
        width="100%"
        height="100%"
        viewBox={`0 0 ${layout.cardWidth} ${layout.cardHeight}`}
      >
        <Path
          d={outline}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth={5}
        />
        <AnimatedPath
          testID="routine-hold-progress-stroke"
          animatedProps={animatedProps}
          d={outline}
          fill="none"
          stroke={color}
          strokeOpacity={0.82}
          strokeWidth={5}
          strokeDasharray={`${perimeter} ${perimeter}`}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

export function RoutineReorderGrid({
  items,
  layout,
  theme,
  scrollRef,
  scrollY,
  viewportHeight,
  contentHeight,
  enabled,
  containerRef,
  onWidthChange,
  onEdit,
  onStart,
  onReorder,
  onMoveByAccessibility,
}: {
  items: ChecklistSummary[];
  layout: RoutineGridMetrics;
  theme: Palette;
  scrollRef: AnimatedRef<ScrollView>;
  scrollY: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  contentHeight: SharedValue<number>;
  enabled: boolean;
  containerRef?: RefObject<View | null>;
  onWidthChange: (width: number) => void;
  onEdit: (id: string) => void;
  onStart: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onMoveByAccessibility: (id: string, delta: -1 | 1) => void;
}) {
  const itemIds = items.map(({ id }) => id).join('|');
  const slots = useSharedValue<SlotMap>(mapSlots(items));
  const initialSlots = useSharedValue<SlotMap>(mapSlots(items));
  const activeId = useSharedValue('');
  const settlingId = useSharedValue('');
  const holdingIndex = useSharedValue(-1);
  const holdProgress = useSharedValue(0);
  const fromIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragTilt = useSharedValue(0);
  const dragging = useSharedValue(0);
  const settleInitialTilt = useSharedValue(0);
  const settleProgress = useSharedValue(1);
  const dragStartScrollY = useSharedValue(0);
  const pointerAbsoluteY = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const [activeRoutine, setActiveRoutine] = useState<string>();
  const activeRoutineRef = useRef<string | undefined>(undefined);
  const itemsRef = useRef(items);
  const suppressedPresses = useRef(new Set<string>());
  const suppressionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    if (activeRoutineRef.current) return;
    const nextSlots = mapSlots(items);
    slots.value = nextSlots;
    initialSlots.value = nextSlots;
  }, [initialSlots, itemIds, items, slots]);

  const suppressPress = useCallback((id: string) => {
    suppressedPresses.current.add(id);
    const timer = setTimeout(() => {
      suppressedPresses.current.delete(id);
    }, PRESS_SUPPRESSION_MS);
    suppressionTimers.current.push(timer);
  }, []);

  const beginDragOnRN = useCallback((id: string) => {
    activeRoutineRef.current = id;
    suppressPress(id);
    Vibration.vibrate(15);
    setActiveRoutine(id);
  }, [suppressPress]);

  const finishDragOnRN = useCallback(
    (id: string, from: number, to: number) => {
      activeRoutineRef.current = undefined;
      suppressPress(id);
      setActiveRoutine(undefined);
      if (from === to) return;
      const currentIds = itemsRef.current.map((item) => item.id);
      const currentFrom = currentIds.indexOf(id);
      if (currentFrom < 0) return;
      onReorder(moveItem(currentIds, currentFrom, to));
    },
    [onReorder, suppressPress],
  );

  const finishCancelOnRN = useCallback(() => {
    activeRoutineRef.current = undefined;
    setActiveRoutine(undefined);
  }, []);

  const cancelActiveDrag = useCallback(() => {
    if (!activeRoutineRef.current) return false;
    scheduleOnUI(
      cancelRoutineDrag,
      activeId,
      settlingId,
      holdingIndex,
      holdProgress,
      slots,
      initialSlots,
      dragX,
      dragY,
      dragTilt,
      dragging,
    );
    finishCancelOnRN();
    return true;
  }, [
    activeId,
    dragTilt,
    dragging,
    dragX,
    dragY,
    finishCancelOnRN,
    holdProgress,
    holdingIndex,
    initialSlots,
    settlingId,
    slots,
  ]);

  useEffect(() => {
    const timers = suppressionTimers.current;
    const back = BackHandler.addEventListener(
      'hardwareBackPress',
      cancelActiveDrag,
    );
    const appState = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') cancelActiveDrag();
    });
    return () => {
      back.remove();
      appState.remove();
      timers.forEach(clearTimeout);
      cancelActiveDrag();
    };
  }, [cancelActiveDrag]);

  useFrameCallback((frame) => {
    if (!dragging.value || viewportHeight.value <= 0) return;
    const viewportY = pointerAbsoluteY.value - viewportTop.value;
    const distanceFromBottom = viewportHeight.value - viewportY;
    const direction =
      viewportY < ROUTINE_AUTOSCROLL_EDGE_SIZE
        ? -1
        : distanceFromBottom < ROUTINE_AUTOSCROLL_EDGE_SIZE
          ? 1
          : 0;
    if (!direction) return;
    const distanceIntoEdge =
      direction < 0
        ? ROUTINE_AUTOSCROLL_EDGE_SIZE - Math.max(0, viewportY)
        : ROUTINE_AUTOSCROLL_EDGE_SIZE - Math.max(0, distanceFromBottom);
    const elapsedMs = Math.min(32, frame.timeSincePreviousFrame ?? 0);
    const delta = getRoutineAutoScrollDelta(distanceIntoEdge, elapsedMs);
    const maxScrollY = Math.max(0, contentHeight.value - viewportHeight.value);
    const nextScrollY = Math.max(
      0,
      Math.min(maxScrollY, scrollY.value + direction * delta),
    );
    if (nextScrollY === scrollY.value) return;
    scrollY.value = nextScrollY;
    scrollTo(scrollRef, 0, nextScrollY, false);
    updateDragTarget(
      dragX,
      dragY,
      scrollY,
      dragStartScrollY,
      startX,
      startY,
      fromIndex,
      targetIndex,
      initialSlots,
      slots,
      layout,
      items.length,
    );
  });

  const gestureFor = (item: ChecklistSummary, fallbackIndex: number) =>
    Gesture.Pan()
      .withTestId(`routine-hold-gesture-${item.id}`)
      .enabled(enabled)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .activateAfterLongPress(ROUTINE_REORDER_TIMING.activationMs)
      .failOffsetX([
        -ROUTINE_REORDER_TIMING.movementTolerance,
        ROUTINE_REORDER_TIMING.movementTolerance,
      ])
      .failOffsetY([
        -ROUTINE_REORDER_TIMING.movementTolerance,
        ROUTINE_REORDER_TIMING.movementTolerance,
      ])
      .blocksExternalGesture(scrollRef as never)
      .onBegin(() => {
        'worklet';
        holdingIndex.value = fallbackIndex;
        holdProgress.value = 0;
        holdProgress.value = withDelay(
          ROUTINE_REORDER_TIMING.feedbackDelayMs,
          withTiming(1, {
            duration:
              ROUTINE_REORDER_TIMING.activationMs -
              ROUTINE_REORDER_TIMING.feedbackDelayMs,
            easing: Easing.linear,
          }),
        );
      })
      .onStart((event) => {
        'worklet';
        cancelAnimation(holdProgress);
        holdProgress.value = 0;
        holdingIndex.value = -1;
        activeId.value = item.id;
        dragging.value = 1;
        settlingId.value = '';
        const currentSlot = slots.value[item.id] ?? fallbackIndex;
        fromIndex.value = currentSlot;
        targetIndex.value = currentSlot;
        initialSlots.value = { ...slots.value };
        const origin = getRoutinePosition(currentSlot, layout);
        startX.value = origin.x;
        startY.value = origin.y;
        dragX.value = 0;
        dragY.value = 0;
        dragTilt.value = 0;
        dragStartScrollY.value = scrollY.value;
        pointerAbsoluteY.value = event.absoluteY;
        const viewport = measure(scrollRef);
        if (viewport) {
          viewportTop.value = viewport.pageY;
          viewportHeight.value = viewport.height;
        }
        scheduleOnRN(beginDragOnRN, item.id);
      })
      .onUpdate((event) => {
        'worklet';
        if (activeId.value !== item.id) return;
        dragX.value = event.translationX;
        dragY.value = event.translationY;
        pointerAbsoluteY.value = event.absoluteY;
        dragTilt.value = withTiming(
          getDirectionalDragTilt(event.velocityX, event.velocityY),
          { duration: SWAY_RESPONSE_MS, easing: Easing.out(Easing.quad) },
        );
        updateDragTarget(
          dragX,
          dragY,
          scrollY,
          dragStartScrollY,
          startX,
          startY,
          fromIndex,
          targetIndex,
          initialSlots,
          slots,
          layout,
          items.length,
        );
      })
      .onEnd(() => {
        'worklet';
        if (activeId.value !== item.id) return;
        dragging.value = 0;
        const from = fromIndex.value;
        const to = targetIndex.value;
        const destination = getRoutinePosition(to, layout);
        settlingId.value = item.id;
        settleInitialTilt.value = dragTilt.value;
        settleProgress.value = 0;
        settleProgress.value = withDelay(
          SETTLE_DELAY_MS,
          withTiming(
            1,
            {
              duration: ROUTINE_ROCKING_DURATION_MS,
              easing: Easing.linear,
            },
            (finished) => {
              if (finished && settlingId.value === item.id) {
                settlingId.value = '';
              }
            },
          ),
        );
        dragX.value = withTiming(destination.x - startX.value, {
          duration: RELEASE_DURATION_MS,
          easing: MOVE_EASING,
        });
        dragY.value = withTiming(
          destination.y -
            startY.value -
            (scrollY.value - dragStartScrollY.value),
          { duration: RELEASE_DURATION_MS, easing: MOVE_EASING },
          (finished) => {
            if (finished && activeId.value === item.id) activeId.value = '';
          },
        );
        scheduleOnRN(finishDragOnRN, item.id, from, to);
      })
      .onFinalize((_event, success) => {
        'worklet';
        cancelAnimation(holdProgress);
        holdProgress.value = 0;
        holdingIndex.value = -1;
        if (!success && activeId.value === item.id) {
          cancelRoutineDrag(
            activeId,
            settlingId,
            holdingIndex,
            holdProgress,
            slots,
            initialSlots,
            dragX,
            dragY,
            dragTilt,
            dragging,
          );
          scheduleOnRN(finishCancelOnRN);
        }
      });

  return (
    <View
      ref={containerRef}
      testID="routine-grid"
      onLayout={(event) => onWidthChange(event.nativeEvent.layout.width)}
      style={{
        height: layout.gridHeight,
        marginTop: 16,
      }}
    >
      {activeRoutine ? (
        <RoutineDropSlot
          layout={layout}
          theme={theme}
          targetIndex={targetIndex}
        />
      ) : null}
      {items.map((item, index) => (
        <RoutinePosition
          key={item.id}
          item={item}
          fallbackIndex={index}
          layout={layout}
          theme={theme}
          gesture={gestureFor(item, index)}
          activeId={activeId}
          settlingId={settlingId}
          holdingIndex={holdingIndex}
          holdProgress={holdProgress}
          slots={slots}
          startX={startX}
          startY={startY}
          dragX={dragX}
          dragY={dragY}
          dragTilt={dragTilt}
          dragStartScrollY={dragStartScrollY}
          scrollY={scrollY}
          settleInitialTilt={settleInitialTilt}
          settleProgress={settleProgress}
          onEdit={() => {
            if (!suppressedPresses.current.has(item.id)) onEdit(item.id);
          }}
          onStart={() => onStart(item.id)}
          onMoveEarlier={
            index > 0
              ? () => onMoveByAccessibility(item.id, -1)
              : undefined
          }
          onMoveLater={
            index < items.length - 1
              ? () => onMoveByAccessibility(item.id, 1)
              : undefined
          }
        />
      ))}
    </View>
  );
}
