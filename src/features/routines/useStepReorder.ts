import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type RefObject,
} from 'react';
import {
  Keyboard,
  Vibration,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, ScrollView } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { getEdgeAutoscrollDelta as calculateEdgeAutoscrollDelta } from './edgeAutoscroll';
import { QUICK_THEN_GENTLE, STEP_MAKE_ROOM_MS } from './motion';

export const STEP_REORDER_HOLD_MS = 350;
/** How far a finger may drift (on either axis) while holding a step. */
export const STEP_REORDER_HOLD_DRIFT = 12;
export const STEP_REORDER_RELEASE_MS = 120;
/** Haptic when a held step lifts, and each time it passes another step. */
export const STEP_PICKUP_VIBRATION_MS = 12;
export const STEP_PASS_VIBRATION_MS = 8;
const EDGE_AUTOSCROLL_THRESHOLD = 70;
const EDGE_AUTOSCROLL_MAX_SPEED = 840;
const MAX_AUTOSCROLL_FRAME_MS = 32;

export function getEdgeAutoscrollDelta(
  distanceIntoEdge: number,
  elapsedMs: number,
): number {
  return calculateEdgeAutoscrollDelta(distanceIntoEdge, elapsedMs, EDGE_AUTOSCROLL_THRESHOLD, EDGE_AUTOSCROLL_MAX_SPEED);
}

export type ReorderStep = { localId: string; text: string };
export type StepRowLayout = { y: number; height: number };
export type StepDragState = {
  localId: string;
  text: string;
  from: number;
  to: number;
  top: number;
  height: number;
};
type DragContext = {
  localId: string;
  text: string;
  from: number;
  to: number;
  height: number;
  previewTop: number;
  startCenterY: number;
  startPageY: number;
  startScrollY: number;
  /**
   * `settling` while lifting the step reshapes the list (see onDragStart):
   * the slot holds still and the other steps' new places are taken. Then
   * `aiming`: the slot follows the finger.
   */
  phase: 'settling' | 'aiming';
};

type StepReorderOptions = {
  items: ReorderStep[];
  /** Commits a finished drag. */
  onMove: (from: number, to: number) => void;
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
  /**
   * Called when a held step lifts (e.g. to close an open step). Returns how
   * long, in ms, that takes to change where the other steps are (0 if it
   * doesn't); the drag aims once it's done.
   */
  onDragStart: () => number;
};

export function getDropTargetOffset(
  layouts: (StepRowLayout | null)[],
  from: number,
  to: number,
): number {
  const fromLayout = layouts[from];
  const toLayout = layouts[to];
  if (!fromLayout || !toLayout || from === to) return 0;
  const targetTop = to > from
    ? toLayout.y + toLayout.height - fromLayout.height
    : toLayout.y;
  return targetTop - fromLayout.y;
}

/**
 * How far a held step's own place moved while it was held (steps above it
 * closing up): as far as the edge of the step next to it did.
 */
export function getOwnPlaceShift(
  before: (StepRowLayout | null)[],
  after: (StepRowLayout | null)[],
  index: number,
): number {
  const [wasAbove, isAbove] = [before[index - 1], after[index - 1]];
  if (wasAbove && isAbove) return isAbove.y + isAbove.height - (wasAbove.y + wasAbove.height);
  const [wasBelow, isBelow] = [before[index + 1], after[index + 1]];
  if (wasBelow && isBelow) return isBelow.y - wasBelow.y;
  return 0;
}

function getDropIndex(
  layouts: (StepRowLayout | null)[],
  activeIndex: number,
  contentY: number,
): number {
  'worklet';
  let index = 0;
  for (let stepIndex = 0; stepIndex < layouts.length; stepIndex += 1) {
    if (stepIndex === activeIndex) continue;
    const layout = layouts[stepIndex];
    if (layout && contentY < layout.y + layout.height / 2) return index;
    index += 1;
  }
  return index;
}

function dragStateFrom(context: DragContext): StepDragState {
  return {
    localId: context.localId,
    text: context.text,
    from: context.from,
    to: context.to,
    top: context.previewTop,
    height: context.height,
  };
}

function releaseDragClaim(
  active: Pick<SharedValue<number>, 'value'>,
  from: Pick<SharedValue<number>, 'value'>,
  target: Pick<SharedValue<number>, 'value'>,
  nearEdge: Pick<SharedValue<number>, 'value'>,
  expectedFrom: number,
) {
  'worklet';
  if (from.value !== expectedFrom) return;
  active.value = 0;
  from.value = -1;
  target.value = -1;
  nearEdge.value = 0;
}

export function useStepReorder({
  items,
  onMove,
  scrollRef,
  onDragStart,
}: StepReorderOptions) {
  // Every step's latest place, by id, from its row's layout events (a row
  // sends one only when its frame changes, so this is kept for every step,
  // whatever its position). The held step's own are skipped while it's held:
  // it's out of the list then.
  const layoutsById = useRef<Record<string, StepRowLayout>>({});
  // The places by position, which drags aim with: the current order's, and
  // fixed while a drag is under way (see onRowLayout).
  const rowLayouts = useRef<(StepRowLayout | null)[]>([]);
  // Where the steps were when the current drag started.
  const startLayouts = useRef<(StepRowLayout | null)[]>([]);
  const dragRef = useRef<DragContext | null>(null);
  const scrollY = useRef(0);
  const viewportTop = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const dragPageY = useRef<number | null>(null);
  const autoscrollFrame = useRef<number | null>(null);
  const lastAutoscrollTime = useRef<number | null>(null);
  const rowLayoutsValue = useSharedValue<(StepRowLayout | null)[]>([]);
  const scrollYValue = useSharedValue(0);
  const viewportTopValue = useSharedValue(0);
  const viewportHeightValue = useSharedValue(0);
  const dragActive = useSharedValue(0);
  const dragFrom = useSharedValue(-1);
  const dragTarget = useSharedValue(-1);
  const dragStartPageY = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const dragNearEdge = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  // 0 while a lift's reshaping settles; the slot then holds still.
  const dragSettled = useSharedValue(1);
  // Where the finger is, so the drag can aim when it has settled.
  const dragLatestPageY = useSharedValue(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragPreviewOpacity = useSharedValue(1);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [drag, setDrag] = useState<StepDragState | null>(null);
  // After a cancel, the held step's id while the steps that made room
  // spring back.
  const [returning, setReturning] = useState<string | null>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [settlingPreview, setSettlingPreview] =
    useState<StepDragState | null>(null);
  const dragPreview = drag ?? settlingPreview;
  const dragPreviewStyle = useAnimatedStyle(() => ({
    opacity: dragPreviewOpacity.value,
    transform: [{ translateY: dragOffset.value }],
  }));

  // Read by the editor too (keeping the open step above the keyboard).
  const geometry = useMemo(() => ({
    /** Where step `localId` is on the steps' card, as last laid out. */
    layoutOf: (localId: string): StepRowLayout | undefined => layoutsById.current[localId],
    /** The list's scroll position. */
    scrollY: () => scrollY.current,
    /** Where the list's viewport is on screen. */
    viewport: () => ({ top: viewportTop.current, height: viewportHeight.current }),
  }), []);

  const syncPositions = () => {
    rowLayouts.current = itemsRef.current.map((item) => layoutsById.current[item.localId] ?? null);
    rowLayoutsValue.value = [...rowLayouts.current];
  };

  // During a drag, the other steps' places count for aiming only while the
  // slot is in the held step's own place: then they're where they'd be
  // without the drag (an open step closing, UNDO rows going), not making room.
  const onRowLayout = (localId: string, event: LayoutChangeEvent) => {
    const current = dragRef.current;
    if (current?.localId === localId) return;
    const { y, height } = event.nativeEvent.layout;
    layoutsById.current[localId] = { y, height };
    if (!current) {
      syncPositions();
    } else if (current.to === current.from) {
      const index = itemsRef.current.findIndex((item) => item.localId === localId);
      if (index >= 0) {
        rowLayouts.current[index] = { y, height };
        rowLayoutsValue.value = [...rowLayouts.current];
      }
    }
  };

  // A drop, or a step added, deleted or put back: positions follow the order.
  const order = items.map((item) => item.localId).join('|');
  useEffect(() => {
    if (!dragRef.current) syncPositions();
    // syncPositions reads the latest order through itemsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const autoscrollNearEdge = (pageY: number, elapsedMs: number): boolean => {
    const maxY = Math.max(0, contentHeight.current - viewportHeight.current);
    if (!viewportHeight.current || !maxY) return false;

    const viewportY = pageY - viewportTop.current;
    const distanceFromBottom = viewportHeight.current - viewportY;
    const direction = viewportY < EDGE_AUTOSCROLL_THRESHOLD
      ? -1
      : distanceFromBottom < EDGE_AUTOSCROLL_THRESHOLD
        ? 1
        : 0;
    if (!direction) return false;
    const distanceIntoEdge = direction < 0
      ? EDGE_AUTOSCROLL_THRESHOLD - Math.max(0, viewportY)
      : EDGE_AUTOSCROLL_THRESHOLD - Math.max(0, distanceFromBottom);
    const delta = getEdgeAutoscrollDelta(
      distanceIntoEdge,
      Math.min(MAX_AUTOSCROLL_FRAME_MS, elapsedMs),
    );
    const nextY = Math.min(
      maxY,
      Math.max(0, scrollY.current + direction * delta),
    );
    if (nextY === scrollY.current && delta > 0) return false;

    if (nextY !== scrollY.current) {
      scrollY.current = nextY;
      scrollYValue.value = nextY;
      scrollRef.current?.scrollTo({ y: nextY, animated: false });
    }
    return true;
  };

  const commitDropTarget = (to: number) => {
    const current = dragRef.current;
    if (!current || current.phase === 'settling') return;
    if (current.to === to) return;
    current.to = to;
    dragTarget.value = to;
    Vibration.vibrate(STEP_PASS_VIBRATION_MS);
    setDrag(dragStateFrom(current));
  };

  const updateDragPosition = (pageY: number) => {
    const current = dragRef.current;
    if (!current) return;
    const contentY =
      current.startCenterY +
      (pageY - current.startPageY) +
      (scrollY.current - current.startScrollY);
    dragOffset.value = contentY - current.height / 2 - current.previewTop;
    commitDropTarget(getDropIndex(rowLayouts.current, current.from, contentY));
  };

  const continueEdgeAutoscroll = (timestamp: number) => {
    autoscrollFrame.current = null;
    const pageY = dragPageY.current;
    if (pageY == null || !dragRef.current) return;
    const previousTime = lastAutoscrollTime.current;
    lastAutoscrollTime.current = timestamp;
    const elapsedMs = previousTime == null ? 0 : timestamp - previousTime;
    if (!autoscrollNearEdge(pageY, elapsedMs)) {
      lastAutoscrollTime.current = null;
      return;
    }
    updateDragPosition(pageY);
    autoscrollFrame.current = requestAnimationFrame(continueEdgeAutoscroll);
  };

  const cancelEdgeAutoscroll = () => {
    dragPageY.current = null;
    lastAutoscrollTime.current = null;
    if (autoscrollFrame.current != null) {
      cancelAnimationFrame(autoscrollFrame.current);
      autoscrollFrame.current = null;
    }
  };

  const startDrag = (localId: string, pageY: number) => {
    setSettlingPreview(null);
    if (returnTimer.current) clearTimeout(returnTimer.current);
    setReturning(null);
    const currentItems = itemsRef.current;
    const index = currentItems.findIndex((item) => item.localId === localId);
    if (index < 0) return;
    const item = currentItems[index];
    const layout = rowLayouts.current[index];
    if (!layout || dragRef.current) return;

    Keyboard.dismiss();
    Vibration.vibrate(STEP_PICKUP_VIBRATION_MS);
    startLayouts.current = [...rowLayouts.current];
    const settleMs = onDragStart();
    const current: DragContext = {
      localId: item.localId,
      text: item.text,
      from: index,
      to: index,
      height: layout.height,
      previewTop: layout.y,
      startCenterY: layout.y + layout.height / 2,
      startPageY: pageY,
      startScrollY: scrollY.current,
      phase: settleMs > 0 ? 'settling' : 'aiming',
    };
    dragRef.current = current;
    setDrag(dragStateFrom(current));
    if (settleMs > 0) settleTimer.current = setTimeout(startAiming, settleMs);
    else startAiming();
  };

  // Once settled (or let go of while settling), the drag aims where the
  // finger is, against where the steps now are.
  const startAiming = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    dragSettled.value = 1;
    const current = dragRef.current;
    if (!current || current.phase === 'aiming') return;
    current.phase = 'aiming';
    dragTarget.value = -1;
    updateDragPosition(dragLatestPageY.value);
  };

  const endSettling = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
    dragSettled.value = 1;
  };

  const updateEdgeDrag = (pageY: number, nearEdge: boolean) => {
    if (!dragRef.current) return;
    if (!nearEdge) {
      cancelEdgeAutoscroll();
      return;
    }
    dragPageY.current = pageY;
    if (
      autoscrollFrame.current == null &&
      autoscrollNearEdge(pageY, 0)
    ) {
      lastAutoscrollTime.current = null;
      autoscrollFrame.current = requestAnimationFrame(continueEdgeAutoscroll);
    }
  };

  const completeDragRelease = (localId: string) => {
    setSettlingPreview((current) =>
      current?.localId === localId ? null : current,
    );
  };

  const finishDrag = (localId: string, claimedIndex: number) => {
    const current = dragRef.current;
    if (!current || current.localId !== localId) {
      scheduleOnUI(
        releaseDragClaim,
        dragActive,
        dragFrom,
        dragTarget,
        dragNearEdge,
        claimedIndex,
      );
      return;
    }
    if (current.phase === 'settling') startAiming();
    dragRef.current = null;
    cancelEdgeAutoscroll();
    endSettling();
    const targetOffset = current.from === current.to
      ? getOwnPlaceShift(startLayouts.current, rowLayouts.current, current.from)
      : getDropTargetOffset(rowLayouts.current, current.from, current.to);
    setDrag(null);
    setSettlingPreview(dragStateFrom(current));
    if (current.from !== current.to) onMove(current.from, current.to);
    dragOffset.value = withTiming(targetOffset, {
      duration: STEP_REORDER_RELEASE_MS,
      easing: QUICK_THEN_GENTLE,
    });
    dragPreviewOpacity.value = withTiming(
      0,
      {
        duration: STEP_REORDER_RELEASE_MS,
        easing: QUICK_THEN_GENTLE,
      },
      (finished) => {
        releaseDragClaim(
          dragActive,
          dragFrom,
          dragTarget,
          dragNearEdge,
          claimedIndex,
        );
        if (finished) scheduleOnRN(completeDragRelease, current.localId);
      },
    );
    // Keep the preview offset under animation control until the reordered rows
    // commit; the next drag initializes it from zero.
  };

  // The steps that made room spring back with the drag's spring.
  const cancelDrag = (localId: string) => {
    if (dragRef.current?.localId !== localId) return;
    dragRef.current = null;
    cancelEdgeAutoscroll();
    endSettling();
    setDrag(null);
    setReturning(localId);
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => {
      returnTimer.current = null;
      setReturning(null);
    }, STEP_MAKE_ROOM_MS);
  };

  const moveItemByAction = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= itemsRef.current.length) return;
    onMove(index, to);
  };

  const holdActivation = useSharedValue(0);
  const holdStartX = useSharedValue(0);
  const holdStartY = useSharedValue(0);

  const dragHandlers = <T extends ReturnType<typeof Gesture.Pan>>(
    gesture: T,
    item: ReorderStep,
    stepIndex: number,
  ) =>
    gesture
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .blocksExternalGesture(scrollRef as never)
      .onStart((event) => {
        'worklet';
        const layout = rowLayoutsValue.value[stepIndex];
        if (!layout || dragActive.value) return;
        dragActive.value = 1;
        dragFrom.value = stepIndex;
        dragTarget.value = stepIndex;
        dragStartPageY.value = event.absoluteY;
        dragLatestPageY.value = event.absoluteY;
        dragStartScrollY.value = scrollYValue.value;
        dragNearEdge.value = 0;
        // Settled once JS knows whether lifting reshapes the list.
        dragSettled.value = 0;
        dragPreviewOpacity.value = 1;
        dragOffset.value = 0;
        scheduleOnRN(startDrag, item.localId, event.absoluteY);
      })
      .onUpdate((event) => {
        'worklet';
        const layout = rowLayoutsValue.value[stepIndex];
        if (!layout || !dragActive.value || dragFrom.value !== stepIndex) {
          return;
        }
        dragLatestPageY.value = event.absoluteY;
        const contentY =
          layout.y + layout.height / 2 +
          (event.absoluteY - dragStartPageY.value) +
          (scrollYValue.value - dragStartScrollY.value);
        dragOffset.value = contentY - layout.height / 2 - layout.y;
        const to = getDropIndex(rowLayoutsValue.value, stepIndex, contentY);
        if (dragSettled.value && to !== dragTarget.value) {
          dragTarget.value = to;
          scheduleOnRN(commitDropTarget, to);
        }
        const viewportY = event.absoluteY - viewportTopValue.value;
        const nearEdge =
          viewportHeightValue.value > 0 &&
          (viewportY < EDGE_AUTOSCROLL_THRESHOLD ||
            viewportHeightValue.value - viewportY < EDGE_AUTOSCROLL_THRESHOLD);
        if (nearEdge || dragNearEdge.value) {
          dragNearEdge.value = nearEdge ? 1 : 0;
          scheduleOnRN(updateEdgeDrag, event.absoluteY, nearEdge);
        }
      })
      .onEnd((_event, success) => {
        'worklet';
        // A cancelled drag ends unsuccessfully, then finalizes as cancelled.
        if (success && dragFrom.value === stepIndex) {
          scheduleOnRN(finishDrag, item.localId, stepIndex);
        }
      })
      .onFinalize((_event, success) => {
        'worklet';
        cancelAnimation(holdActivation);
        if (dragFrom.value !== stepIndex) return;
        if (!success) {
          scheduleOnRN(cancelDrag, item.localId);
          releaseDragClaim(
            dragActive,
            dragFrom,
            dragTarget,
            dragNearEdge,
            stepIndex,
          );
        }
      });

  /**
   * Holding a step for STEP_REORDER_HOLD_MS lifts it. The finger may drift
   * up to STEP_REORDER_HOLD_DRIFT on either axis first; more than that lets
   * the list scroll (or a sideways swipe take over) instead.
   */
  const gestureFor = (item: ReorderStep, stepIndex: number) =>
    dragHandlers(
      Gesture.Pan()
        .withTestId(`step-hold-gesture-${item.localId}-${stepIndex}`)
        .manualActivation(true)
        .simultaneousWithExternalGesture(scrollRef as never)
        .onTouchesDown((event, manager) => {
          'worklet';
          if (event.numberOfTouches !== 1 || dragActive.value) {
            manager.fail();
            return;
          }
          const touch = event.allTouches[0];
          holdStartX.value = touch.absoluteX;
          holdStartY.value = touch.absoluteY;
          holdActivation.value = 0;
          holdActivation.value = withDelay(
            STEP_REORDER_HOLD_MS,
            withTiming(1, { duration: 0 }, (finished) => {
              if (finished) manager.activate();
            }),
          );
        })
        .onTouchesMove((event, manager) => {
          'worklet';
          if (dragActive.value) return;
          const touch = event.allTouches[0];
          if (!touch) return;
          if (
            Math.abs(touch.absoluteX - holdStartX.value) > STEP_REORDER_HOLD_DRIFT ||
            Math.abs(touch.absoluteY - holdStartY.value) > STEP_REORDER_HOLD_DRIFT
          ) {
            cancelAnimation(holdActivation);
            manager.fail();
          }
        })
        .onTouchesUp((_event, manager) => {
          'worklet';
          if (!dragActive.value) {
            cancelAnimation(holdActivation);
            manager.fail();
          }
        }),
      item,
      stepIndex,
    );

  useEffect(
    () => () => {
      if (autoscrollFrame.current != null) {
        cancelAnimationFrame(autoscrollFrame.current);
      }
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (returnTimer.current) clearTimeout(returnTimer.current);
    },
    [],
  );

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
    scrollYValue.value = scrollY.current;
  };

  const onViewportLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    viewportTop.current = y;
    viewportHeight.current = height;
    viewportTopValue.value = y;
    viewportHeightValue.value = height;
  };

  return {
    drag,
    /** Other steps glide to make room: during a drag, and while they return after a cancel. */
    makingRoom: !!drag || !!returning,
    /** The held step, which never glides (it would fly to where it lands). */
    heldId: drag?.localId ?? returning,
    dragPreview,
    dragPreviewStyle,
    gestureFor,
    moveItemByAction,
    onRowLayout,
    onScroll,
    onViewportLayout,
    setContentHeight: (height: number) => {
      contentHeight.current = height;
    },
    geometry,
  };
}
