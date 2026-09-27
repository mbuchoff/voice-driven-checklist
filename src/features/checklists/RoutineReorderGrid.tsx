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
  ROUTINE_HOLD_ACTIVATION_MS,
  ROUTINE_HOLD_FEEDBACK_DELAY_MS,
} from './routineMotion';
import type { LibraryChecklist } from './types';
import { mapRoutineSlots, useRoutineDragState, type RoutineDragState, type SlotMap } from './useRoutineDragState';
import { useRoutinePressGuard } from './useRoutinePressGuard';

const CARD_MOVE_DURATION_MS = 190;
const RELEASE_DURATION_MS = 220;
const SWAY_RESPONSE_MS = 72;
const MAX_TILT_DEGREES = 9;
const SETTLE_DELAY_MS = 80;
const PRESS_SUPPRESSION_MS = 400;
const MOVE_EASING = Easing.bezier(0.22, 0.75, 0.2, 1);
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
  motion: RoutineDragState,
  layout: RoutineGridMetrics,
  itemCount: number,
) {
  'worklet';
  const centerX = motion.startX.value + layout.cardWidth / 2 + motion.dragX.value;
  const centerY =
    motion.startY.value +
    layout.cardHeight / 2 +
    motion.dragY.value +
    (motion.commandedScrollY.value - motion.dragStartScrollY.value);
  const nextTarget = getRoutineTargetIndex(
    centerX,
    centerY,
    layout,
    itemCount,
  );
  if (nextTarget === motion.targetIndex.value) return;
  motion.targetIndex.value = nextTarget;
  motion.slots.value = displaceSlots(
    motion.initialSlots.value,
    motion.fromIndex.value,
    nextTarget,
  );
}

function cancelRoutineDrag(motion: RoutineDragState) {
  'worklet';
  cancelAnimation(motion.holdProgress);
  cancelAnimation(motion.dragX);
  cancelAnimation(motion.dragY);
  motion.slots.value = { ...motion.initialSlots.value };
  motion.activeId.value = '';
  motion.holdOwner.value = '';
  motion.holdProgress.value = 0;
  motion.dragX.value = 0;
  motion.dragY.value = 0;
  motion.dragTilt.value = 0;
  motion.dragging.value = 0;
  motion.lastFrameTimestamp.value = null;
}

function RoutinePosition({
  item,
  fallbackIndex,
  layout,
  theme,
  gesture,
  motion,
  onEdit,
  gestureEnabled,
  isSuppressed,
  onStart,
  onMoveEarlier,
  onMoveLater,
}: {
  item: LibraryChecklist;
  fallbackIndex: number;
  layout: RoutineGridMetrics;
  theme: Palette;
  gesture: GestureType;
  motion: RoutineDragState;
  onEdit: () => void;
  gestureEnabled: boolean;
  isSuppressed: () => boolean;
  onStart: () => void;
  onMoveEarlier?: () => void;
  onMoveLater?: () => void;
}) {
  const pressGuard = useRoutinePressGuard({
    gestureEnabled,
    isSuppressed,
    isGestureCancelled: () => motion.selectionCancelled.value[item.id] === true,
  });
  // Play is outside the Pan surface, so it must not read that surface's stale
  // cancellation latch. It owns its contact while sharing the drop cooldown.
  const playPressGuard = useRoutinePressGuard({
    gestureEnabled: false,
    isSuppressed,
    isGestureCancelled: () => false,
  });
  // Capture only render inputs: capturing the entire bundle would subscribe
  // every card to unrelated hold timers and frame bookkeeping.
  const { slots, activeId, dragTilt, holdOwner, holdProgress, startX, dragX, startY, dragY, dragScrollDelta, dragLift } = motion;
  const positionStyle = useAnimatedStyle(() => {
    const slot = slots.value[item.id] ?? fallbackIndex;
    const destination = getRoutinePosition(slot, layout);
    const active = activeId.value === item.id;
    const rotation = active ? dragTilt.value * MAX_TILT_DEGREES : 0;
    const dimmed =
      holdOwner.value !== '' && holdOwner.value !== item.id;

    return {
      zIndex: active ? 20 : 1,
      elevation: active ? 12 : 0,
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
        pressGuard={pressGuard}
        playPressGuard={playPressGuard}
        onStart={onStart}
      />
      <RoutineHoldFeedback
        itemId={item.id}
        layout={layout}
        color={getRoutineCardColors(item.id, theme.mode).ink}
        holdOwner={motion.holdOwner}
        progress={motion.holdProgress}
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
  itemId, layout, color, holdOwner, progress,
}: {
  itemId: string;
  layout: RoutineGridMetrics;
  color: string;
  holdOwner: SharedValue<string>;
  progress: SharedValue<number>;
}) {
  const containerStyle = useAnimatedStyle(() => ({
    opacity: holdOwner.value === itemId && progress.value > 0
      ? Math.min(1, progress.value * 10) : 0,
  }));

  return (
    <Animated.View
      testID={`routine-hold-feedback-${itemId}`}
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
  orderRevision,
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
  items: LibraryChecklist[];
  orderRevision: number;
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
  const motion = useRoutineDragState(items);
  const [activeRoutine, setActiveRoutine] = useState<string>();
  const activeRoutineRef = useRef<string | undefined>(undefined);
  const itemsRef = useRef(items);
  const suppressedPresses = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  itemsRef.current = items;

  useEffect(() => {
    if (activeRoutineRef.current) return;
    const nextSlots = mapRoutineSlots(items);
    motion.slots.value = nextSlots;
    motion.initialSlots.value = nextSlots;
  }, [motion, items, orderRevision]);

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
      // Clear before publishing an order: the items reconciliation effect must
      // be free to accept either the saved order or a declined-drop repair.
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
    scheduleOnUI(cancelRoutineDrag, motion);
    finishCancelOnRN();
    return true;
  }, [motion, finishCancelOnRN]);

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
      cancelAnimation(motion.holdActivation);
      cancelAnimation(motion.holdProgress);
      cancelActiveDrag();
    };
  }, [cancelActiveDrag, motion]);

  const updateDragFrame = useCallback((frame: FrameInfo) => {
    'worklet';
    if (!motion.dragging.value || viewportHeight.value <= 0) return;
    // Native events also flush Reanimated frame callbacks, sometimes with a
    // timestamp older than the last frame. Never count that interval twice.
    const previousTimestamp = motion.lastFrameTimestamp.value ?? frame.timestamp;
    motion.lastFrameTimestamp.value = Math.max(previousTimestamp, frame.timestamp);
    const elapsedMs = Math.min(32, Math.max(0, frame.timestamp - previousTimestamp));
    // Ordinary scrolling never changes a shared value consumed by every card.
    motion.dragScrollDelta.value = motion.commandedScrollY.value - motion.dragStartScrollY.value;
    const previousIdle = motion.idleMotionMs.value;
    motion.idleMotionMs.value += elapsedMs;
    if (motion.idleMotionMs.value >= SETTLE_DELAY_MS) {
      if (previousIdle < SETTLE_DELAY_MS) {
        cancelAnimation(motion.dragTilt);
        motion.settleInitialTilt.value = motion.dragTilt.value;
      }
      motion.dragTilt.value = getRoutineRockingTilt(motion.settleInitialTilt.value, motion.idleMotionMs.value - SETTLE_DELAY_MS);
    }
    const topDepth = motion.edgeThresholds.value.top - motion.pointerAbsoluteY.value;
    const bottomDepth = motion.pointerAbsoluteY.value - motion.edgeThresholds.value.bottom;
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
      Math.min(maxScrollY, motion.commandedScrollY.value + direction * delta),
    );
    if (nextScrollY === motion.commandedScrollY.value) return;
    // Scroll acknowledgments can arrive after a newer command. Keep the drag's
    // position authoritative until release; native reports still track the real
    // viewport separately and seed the next drag.
    motion.commandedScrollY.value = nextScrollY;
    motion.dragScrollDelta.value = nextScrollY - motion.dragStartScrollY.value;
    scrollTo(scrollRef, 0, nextScrollY, false);
    updateDragTarget(motion, layout, items.length);
  }, [contentHeight, motion, items.length, layout, scrollRef, viewportHeight]);
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
      // Android's ScrollView can enter native ACTIVE while still waiting for
      // this hold. Let the hold activate beside that pending recognizer; the
      // blocks relation still withholds scrolling until the hold fails, and
      // cancels the waiting scroll when a successful drag ends.
      .simultaneousWithExternalGesture(scrollRef as never)
      .onTouchesDown((event, manager) => {
        'worklet';
        if (event.numberOfTouches !== 1 || (motion.holdOwner.value && motion.holdOwner.value !== item.id)) {
          motion.selectionCancelled.value = { ...motion.selectionCancelled.value, [item.id]: true };
          manager.fail();
          return;
        }
        motion.holdOwner.value = item.id;
        // This latch lasts for the pointer sequence, including a late release
        // after a failed Pan. A new contact, not a timer, enables selection again.
        motion.selectionCancelled.value = { ...motion.selectionCancelled.value, [item.id]: false };
        const touch = event.allTouches[0];
        motion.holdStartX.value = touch.absoluteX;
        motion.holdStartY.value = touch.absoluteY;
        const viewport = measure(scrollRef);
        if (viewport) {
          motion.viewportTop.value = viewport.pageY;
          viewportHeight.value = viewport.height;
        }
        motion.edgeThresholds.value = getRoutineScrollThresholds(touch.absoluteY, motion.viewportTop.value, motion.viewportTop.value + viewportHeight.value);
        motion.holdActivation.value = 0;
        motion.holdActivation.value = withDelay(ROUTINE_HOLD_ACTIVATION_MS,
          withTiming(1, { duration: 0 }, (finished) => {
            if (finished) manager.activate();
          }));
      })
      .onTouchesMove((event, manager) => {
        'worklet';
        if (motion.holdOwner.value !== item.id) { manager.fail(); return; }
        const touch = event.allTouches[0];
        if (!touch) return;
        motion.edgeThresholds.value = getRoutineScrollThresholds(touch.absoluteY, motion.viewportTop.value, motion.viewportTop.value + viewportHeight.value, motion.edgeThresholds.value);
        if (!motion.dragging.value && routineHoldShouldYield(touch.absoluteX - motion.holdStartX.value, touch.absoluteY - motion.holdStartY.value)) {
          motion.selectionCancelled.value = { ...motion.selectionCancelled.value, [item.id]: true };
          cancelAnimation(motion.holdActivation);
          manager.fail();
        }
      })
      .onBegin(() => {
        'worklet';
        // Different card handlers may track different fingers concurrently.
        // Claim in either begin/down order; only the owner can mutate hold state.
        if (motion.holdOwner.value && motion.holdOwner.value !== item.id) return;
        motion.holdOwner.value = item.id;
        motion.holdProgress.value = 0;
        motion.holdProgress.value = withDelay(
          ROUTINE_HOLD_FEEDBACK_DELAY_MS,
          withTiming(1, {
            duration:
              ROUTINE_HOLD_ACTIVATION_MS -
              ROUTINE_HOLD_FEEDBACK_DELAY_MS,
            easing: Easing.linear,
          }),
        );
      })
      .onStart((event) => {
        'worklet';
        if (motion.holdOwner.value !== item.id) return;
        // Activation consumes this pointer's selection, even if interruption
        // occurs after the short post-drag cooldown has expired.
        motion.selectionCancelled.value = { ...motion.selectionCancelled.value, [item.id]: true };
        motion.dragGeneration.value += 1;
        cancelAnimation(motion.dragX);
        cancelAnimation(motion.dragY);
        cancelAnimation(motion.dragTilt);
        cancelAnimation(motion.dragLift);
        cancelAnimation(motion.holdActivation);
        cancelAnimation(motion.holdProgress);
        motion.holdProgress.value = 0;
        motion.activeId.value = item.id;
        motion.dragging.value = 1;
        const currentSlot = motion.slots.value[item.id] ?? fallbackIndex;
        motion.fromIndex.value = currentSlot;
        motion.targetIndex.value = currentSlot;
        motion.initialSlots.value = { ...motion.slots.value };
        const origin = getRoutinePosition(currentSlot, layout);
        motion.startX.value = origin.x;
        motion.startY.value = origin.y;
        motion.dragX.value = 0;
        motion.dragY.value = 0;
        motion.dragTilt.value = 0;
        motion.dragLift.value = 1.045;
        motion.dragScrollDelta.value = 0;
        motion.idleMotionMs.value = 0;
        motion.dragStartScrollY.value = scrollY.value;
        motion.commandedScrollY.value = scrollY.value;
        motion.lastFrameTimestamp.value = null;
        motion.pointerAbsoluteY.value = event.absoluteY;
        const viewport = measure(scrollRef);
        if (viewport) {
          motion.viewportTop.value = viewport.pageY;
          viewportHeight.value = viewport.height;
        }
        scheduleOnRN(beginDragOnRN, item.id);
      })
      .onUpdate((event) => {
        'worklet';
        if (motion.activeId.value !== item.id) return;
        motion.dragX.value = event.translationX;
        motion.dragY.value = event.translationY;
        motion.pointerAbsoluteY.value = event.absoluteY;
        motion.idleMotionMs.value = 0;
        motion.dragTilt.value = withTiming(
          getDirectionalDragTilt(event.velocityX, event.velocityY),
          { duration: SWAY_RESPONSE_MS, easing: Easing.out(Easing.quad) },
        );
        updateDragTarget(motion, layout, items.length);
      })
      .onEnd((_event, success) => {
        'worklet';
        if (!success || motion.activeId.value !== item.id) return;
        motion.dragging.value = 0;
        const from = motion.fromIndex.value;
        const to = motion.targetIndex.value;
        const destination = getRoutinePosition(to, layout);
        const generation = motion.dragGeneration.value;
        const releaseMotion = { duration: RELEASE_DURATION_MS, easing: Easing.out(Easing.cubic) };
        motion.dragTilt.value = withTiming(0, releaseMotion);
        motion.dragLift.value = withTiming(1, releaseMotion);
        motion.dragX.value = withTiming(destination.x - motion.startX.value, {
          ...releaseMotion,
        });
        motion.dragY.value = withTiming(
          destination.y -
            motion.startY.value -
            (motion.commandedScrollY.value - motion.dragStartScrollY.value),
          releaseMotion,
          (finished) => {
            if (finished && generation === motion.dragGeneration.value && motion.activeId.value === item.id) {
              motion.activeId.value = '';
            }
          },
        );
        scheduleOnRN(finishDragOnRN, item.id, from, to);
      })
      .onFinalize((_event, success) => {
        'worklet';
        if (motion.holdOwner.value !== item.id) return;
        motion.holdOwner.value = '';
        cancelAnimation(motion.holdProgress);
        cancelAnimation(motion.holdActivation);
        motion.holdProgress.value = 0;
        if (!success && motion.activeId.value === item.id) {
          cancelRoutineDrag(motion);
          scheduleOnRN(finishCancelOnRN);
        }
      }),
  ), [motion, beginDragOnRN, enabled, finishCancelOnRN, finishDragOnRN, items, layout, scrollRef, scrollY, viewportHeight]);

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
          targetIndex={motion.targetIndex}
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
          motion={motion}
          gestureEnabled={enabled}
          isSuppressed={() => suppressedPresses.current.has(item.id)}
          onEdit={() => onEdit(item.id)}
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
