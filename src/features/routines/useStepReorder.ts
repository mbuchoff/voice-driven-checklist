import {
  useEffect,
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
  Easing,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { getEdgeAutoscrollDelta as calculateEdgeAutoscrollDelta } from './edgeAutoscroll';

export const STEP_REORDER_HOLD_MS = 350;
/**
 * When lifting a step closes the open step or clears UNDO rows, its slot
 * holds still this long while the other steps move up, and the drop then
 * aims at where they are (the open step's times fold away in 220 ms).
 */
export const STEP_REORDER_SETTLE_MS = 300;
/** How far a finger may drift (on either axis) while holding a step. */
export const STEP_REORDER_HOLD_DRIFT = 12;
export const STEP_REORDER_RELEASE_MS = 120;
/** Haptic when a held step lifts, and each time it passes another step. */
export const STEP_PICKUP_VIBRATION_MS = 12;
export const STEP_PASS_VIBRATION_MS = 8;
const EDGE_AUTOSCROLL_THRESHOLD = 70;
const EDGE_AUTOSCROLL_MAX_SPEED = 840;
const MAX_AUTOSCROLL_FRAME_MS = 32;
const REORDER_ROW_EASING = Easing.bezier(0.22, 0.75, 0.2, 1);
/**
 * How the steps a dragged step passes, and its slot, glide to make room:
 * 26D's spring. A layout transition starts in the same commit that moves a
 * step, so a drop's new order lands without a stray frame.
 */
export const STEP_MAKE_ROOM_MS = 340;
export const STEP_MAKE_ROOM = LinearTransition.duration(STEP_MAKE_ROOM_MS).easing(Easing.bezier(0.34, 1.4, 0.5, 1));

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
  /** The list is settling after the drag reshaped it: the slot holds still. */
  settling: boolean;
};

type StepReorderOptions = {
  items: ReorderStep[];
  /** Commits a finished drag. */
  onMove: (from: number, to: number) => void;
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
  /**
   * Called when a held step lifts (e.g. to close an open step); true when
   * that changes where the other steps are.
   */
  onDragStart?: () => boolean;
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
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragPreviewOpacity = useSharedValue(1);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [drag, setDrag] = useState<StepDragState | null>(null);
  const [settlingPreview, setSettlingPreview] =
    useState<StepDragState | null>(null);
  const dragPreview = drag ?? settlingPreview;
  const dragPreviewStyle = useAnimatedStyle(() => ({
    opacity: dragPreviewOpacity.value,
    transform: [{ translateY: dragOffset.value }],
  }));

  // During a drag, the other steps' places are taken only while the slot is
  // in the dragged step's own place: then they're where they'd be without
  // the drag (an open step closing, UNDO rows going), not making room.
  const onRowLayout = (index: number, event: LayoutChangeEvent) => {
    const current = dragRef.current;
    if (current && (index === current.from || current.to !== current.from)) return;
    const { y, height } = event.nativeEvent.layout;
    rowLayouts.current[index] = { y, height };
    rowLayoutsValue.value = [...rowLayouts.current];
  };

  useEffect(() => {
    if (rowLayouts.current.length <= items.length) return;
    rowLayouts.current.length = items.length;
    rowLayoutsValue.value = [...rowLayouts.current];
  }, [items.length, rowLayoutsValue]);

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
    if (!current || current.settling) return;
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
    const currentItems = itemsRef.current;
    const index = currentItems.findIndex((item) => item.localId === localId);
    if (index < 0) return;
    const item = currentItems[index];
    const layout = rowLayouts.current[index];
    if (!layout || dragRef.current) return;

    Keyboard.dismiss();
    Vibration.vibrate(STEP_PICKUP_VIBRATION_MS);
    startLayouts.current = [...rowLayouts.current];
    const reshapes = onDragStart?.() ?? false;
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
      settling: reshapes,
    };
    dragRef.current = current;
    setDrag(dragStateFrom(current));
    const settle = () => {
      settleTimer.current = null;
      current.settling = false;
      // The next move aims afresh.
      dragTarget.value = -1;
      dragSettled.value = 1;
    };
    if (reshapes) settleTimer.current = setTimeout(settle, STEP_REORDER_SETTLE_MS);
    else settle();
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
      easing: REORDER_ROW_EASING,
    });
    dragPreviewOpacity.value = withTiming(
      0,
      {
        duration: STEP_REORDER_RELEASE_MS,
        easing: REORDER_ROW_EASING,
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

  const cancelDrag = (localId: string) => {
    if (dragRef.current?.localId !== localId) return;
    dragRef.current = null;
    cancelEdgeAutoscroll();
    endSettling();
    setDrag(null);
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
      .onEnd(() => {
        'worklet';
        if (dragFrom.value === stepIndex) {
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
  };
}
