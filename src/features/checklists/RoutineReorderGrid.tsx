import {
  useCallback,
  useEffect,
  useMemo,
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
  measure,
  scrollTo,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withTiming,
  type AnimatedRef,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import type { Palette } from '@/src/theme/palette';

import { moveItem } from './reorder';
import { getRoutineCardColors, RoutineCard } from './RoutineCard';
import { RoutineHoldOutline } from './RoutineHoldOutline';
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
  getRoutineScrollThresholds,
  routineHoldShouldYield,
  ROUTINE_HOLD_DRIFT_ALLOWANCE,
  ROUTINE_HOLD_FEEDBACK_DELAY_MS,
  type RoutineScrollThresholds,
} from './routineMotion';
import type { ChecklistSummary } from './types';

type SlotMap = Record<string, number>;

export const ROUTINE_REORDER_TIMING = {
  feedbackDelayMs: ROUTINE_HOLD_FEEDBACK_DELAY_MS,
  activationMs: 440,
  movementTolerance: ROUTINE_HOLD_DRIFT_ALLOWANCE,
} as const;

const CARD_MOVE_DURATION_MS = 190;
const RELEASE_DURATION_MS = 220;
const SWAY_RESPONSE_MS = 72;
const MAX_TILT_DEGREES = 9;
const SETTLE_DELAY_MS = 80;
const PRESS_SUPPRESSION_MS = 400;
const MOVE_EASING = Easing.bezier(0.22, 0.75, 0.2, 1);


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
  dragScrollDelta,
  dragLift,
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
  dragScrollDelta: SharedValue<number>;
  dragLift: SharedValue<number>;
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
    const rotation = active ? dragTilt.value * MAX_TILT_DEGREES : 0;
    const dimmed =
      holdingIndex.value >= 0 && holdingIndex.value !== fallbackIndex;

    return {
      zIndex: active || settling ? 20 : 1,
      elevation: active || settling ? 12 : 0,
      opacity: dimmed && holdProgress.value > 0 ? 0.58 : 1,
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
              dragScrollDelta.value
            : withTiming(destination.y, {
                duration: CARD_MOVE_DURATION_MS,
                easing: MOVE_EASING,
              }),
        },
        { scale: active ? dragLift.value : 1 },
        { rotate: `${rotation}deg` },
      ],
    };
  }, [fallbackIndex, item.id, layout]);

  const accessibilityActions = [
    ...(onMoveEarlier ? [{ name: 'move-earlier', label: 'Move earlier' }] : []),
    ...(onMoveLater ? [{ name: 'move-later', label: 'Move later' }] : []),
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
          if (event.nativeEvent.actionName === 'move-earlier') onMoveEarlier?.();
          if (event.nativeEvent.actionName === 'move-later') onMoveLater?.();
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
  index, layout, color, holdingIndex, progress,
}: {
  index: number;
  layout: RoutineGridMetrics;
  color: string;
  holdingIndex: SharedValue<number>;
  progress: SharedValue<number>;
}) {
  const containerStyle = useAnimatedStyle(() => ({
    opacity: holdingIndex.value === index && progress.value > 0
      ? Math.min(1, progress.value * 10) : 0,
  }));

  return (
    <Animated.View
      testID={`routine-hold-feedback-${index}`}
      pointerEvents="none"
      style={[
        {
          position: 'absolute', left: 0, top: 0,
          width: layout.cardWidth, height: layout.cardHeight, zIndex: 30,
        },
        containerStyle,
      ]}
    >
      <RoutineHoldOutline
        width={layout.cardWidth}
        height={layout.cardHeight}
        color={color}
        progress={progress}
      />
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
  const dragStartScrollY = useSharedValue(0);
  const pointerAbsoluteY = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const dragScrollDelta = useSharedValue(0);
  const dragLift = useSharedValue(1);
  const dragGeneration = useSharedValue(0);
  const holdActivation = useSharedValue(0);
  const holdStartX = useSharedValue(0);
  const holdStartY = useSharedValue(0);
  const edgeThresholds = useSharedValue<RoutineScrollThresholds>({ top: 0, bottom: 0 });
  const idleMotionMs = useSharedValue(0);
  const [activeRoutine, setActiveRoutine] = useState<string>();
  const activeRoutineRef = useRef<string | undefined>(undefined);
  const itemsRef = useRef(items);
  const suppressedPresses = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  itemsRef.current = items;

  useEffect(() => {
    if (activeRoutineRef.current) return;
    const nextSlots = mapSlots(items);
    slots.value = nextSlots;
    initialSlots.value = nextSlots;
  }, [initialSlots, itemIds, items, slots]);

  const suppressPress = useCallback((id: string) => {
    clearTimeout(suppressedPresses.current.get(id));
    const timer = setTimeout(() => {
      suppressedPresses.current.delete(id);
    }, PRESS_SUPPRESSION_MS);
    suppressedPresses.current.set(id, timer);
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
    const timers = suppressedPresses.current;
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
      timers.clear();
      cancelAnimation(holdActivation);
      cancelAnimation(holdProgress);
      cancelActiveDrag();
    };
  }, [cancelActiveDrag, holdActivation, holdProgress]);

  const updateDragFrame = useCallback((frame: FrameInfo) => {
    'worklet';
    if (!dragging.value || viewportHeight.value <= 0) return;
    const elapsedMs = Math.min(32, frame.timeSincePreviousFrame ?? 0);
    // Ordinary scrolling never changes a shared value consumed by every card.
    dragScrollDelta.value = scrollY.value - dragStartScrollY.value;
    const previousIdle = idleMotionMs.value;
    idleMotionMs.value += elapsedMs;
    if (idleMotionMs.value >= SETTLE_DELAY_MS) {
      if (previousIdle < SETTLE_DELAY_MS) {
        cancelAnimation(dragTilt);
        settleInitialTilt.value = dragTilt.value;
      }
      dragTilt.value = getRoutineRockingTilt(settleInitialTilt.value, idleMotionMs.value - SETTLE_DELAY_MS);
    }
    const topDepth = edgeThresholds.value.top - pointerAbsoluteY.value;
    const bottomDepth = pointerAbsoluteY.value - edgeThresholds.value.bottom;
    const direction =
      topDepth > 0
        ? -1
        : bottomDepth > 0
          ? 1
          : 0;
    if (!direction) return;
    const distanceIntoEdge = direction < 0 ? topDepth : bottomDepth;
    const delta = getRoutineAutoScrollDelta(distanceIntoEdge, elapsedMs);
    const maxScrollY = Math.max(0, contentHeight.value - viewportHeight.value);
    const nextScrollY = Math.max(
      0,
      Math.min(maxScrollY, scrollY.value + direction * delta),
    );
    if (nextScrollY === scrollY.value) return;
    scrollY.value = nextScrollY;
    dragScrollDelta.value = nextScrollY - dragStartScrollY.value;
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
  }, [contentHeight, dragScrollDelta, dragStartScrollY, dragTilt, dragX, dragY,
    dragging, edgeThresholds, fromIndex, idleMotionMs, initialSlots, items.length,
    layout, pointerAbsoluteY, scrollRef, scrollY, settleInitialTilt, slots,
    startX, startY, targetIndex, viewportHeight]);
  const frameSubscription = useFrameCallback(updateDragFrame, false);
  useEffect(() => {
    frameSubscription.setActive(activeRoutine !== undefined);
    return () => frameSubscription.setActive(false);
  }, [activeRoutine, frameSubscription]);

  const gestures = useMemo(() => items.map((item, fallbackIndex) =>
    Gesture.Pan()
      .withTestId(`routine-hold-gesture-${item.id}`)
      .enabled(enabled)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      // The built-in long-press pan fails at Android's smaller touch slop.
      // Manual UI-thread activation gives the approved radial allowance.
      .manualActivation(true)
      .blocksExternalGesture(scrollRef as never)
      .onTouchesDown((event, manager) => {
        'worklet';
        if (event.numberOfTouches !== 1) { manager.fail(); return; }
        const touch = event.allTouches[0];
        holdStartX.value = touch.absoluteX;
        holdStartY.value = touch.absoluteY;
        const viewport = measure(scrollRef);
        if (viewport) {
          viewportTop.value = viewport.pageY;
          viewportHeight.value = viewport.height;
        }
        edgeThresholds.value = getRoutineScrollThresholds(touch.absoluteY, viewportTop.value, viewportTop.value + viewportHeight.value);
        holdActivation.value = 0;
        holdActivation.value = withDelay(ROUTINE_REORDER_TIMING.activationMs,
          withTiming(1, { duration: 0 }, (finished) => {
            if (finished) manager.activate();
          }));
      })
      .onTouchesMove((event, manager) => {
        'worklet';
        const touch = event.allTouches[0];
        if (!touch) return;
        edgeThresholds.value = getRoutineScrollThresholds(touch.absoluteY, viewportTop.value, viewportTop.value + viewportHeight.value, edgeThresholds.value);
        if (!dragging.value && routineHoldShouldYield(touch.absoluteX - holdStartX.value, touch.absoluteY - holdStartY.value)) {
          cancelAnimation(holdActivation);
          manager.fail();
        }
      })
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
        dragGeneration.value += 1;
        cancelAnimation(dragX);
        cancelAnimation(dragY);
        cancelAnimation(dragTilt);
        cancelAnimation(dragLift);
        cancelAnimation(holdActivation);
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
        dragLift.value = 1.045;
        dragScrollDelta.value = 0;
        idleMotionMs.value = 0;
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
        idleMotionMs.value = 0;
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
      .onEnd((_event, success) => {
        'worklet';
        if (!success || activeId.value !== item.id) return;
        dragging.value = 0;
        const from = fromIndex.value;
        const to = targetIndex.value;
        const destination = getRoutinePosition(to, layout);
        settlingId.value = item.id;
        const generation = dragGeneration.value;
        const releaseMotion = { duration: RELEASE_DURATION_MS, easing: Easing.out(Easing.cubic) };
        dragTilt.value = withTiming(0, releaseMotion);
        dragLift.value = withTiming(1, releaseMotion);
        dragX.value = withTiming(destination.x - startX.value, {
          ...releaseMotion,
        });
        dragY.value = withTiming(
          destination.y -
            startY.value -
            (scrollY.value - dragStartScrollY.value),
          releaseMotion,
          (finished) => {
            if (finished && generation === dragGeneration.value && activeId.value === item.id) {
              activeId.value = '';
              settlingId.value = '';
            }
          },
        );
        scheduleOnRN(finishDragOnRN, item.id, from, to);
      })
      .onFinalize((_event, success) => {
        'worklet';
        cancelAnimation(holdProgress);
        cancelAnimation(holdActivation);
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
      }),
  ), [activeId, beginDragOnRN, dragGeneration, dragLift, dragScrollDelta,
    dragStartScrollY, dragTilt, dragX, dragY, dragging, edgeThresholds, enabled,
    finishCancelOnRN, finishDragOnRN, fromIndex, holdActivation, holdProgress,
    holdStartX, holdStartY, holdingIndex, idleMotionMs, initialSlots, items,
    layout, pointerAbsoluteY, scrollRef, scrollY, settlingId, slots, startX,
    startY, targetIndex, viewportHeight, viewportTop]);

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
          gesture={gestures[index]}
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
          dragScrollDelta={dragScrollDelta}
          dragLift={dragLift}
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
