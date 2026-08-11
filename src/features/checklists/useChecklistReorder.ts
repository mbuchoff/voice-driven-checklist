import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Vibration,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, ScrollView } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { moveItem } from './reorder';

export const CHECKLIST_REORDER_HOLD_MS = 350;
export const CHECKLIST_EDITOR_ROW_GAP = 9;
const EDGE_AUTOSCROLL_THRESHOLD = 56;
const EDGE_AUTOSCROLL_MAX_SPEED = 480;
const MAX_AUTOSCROLL_FRAME_MS = 32;
const REORDER_ROW_DURATION_MS = 190;
const REORDER_ROW_EASING = Easing.bezier(0.22, 0.75, 0.2, 1);

export function getEdgeAutoscrollDelta(
  distanceIntoEdge: number,
  elapsedMs: number,
): number {
  const intensity = Math.min(
    1,
    Math.max(0, distanceIntoEdge) / EDGE_AUTOSCROLL_THRESHOLD,
  );
  return EDGE_AUTOSCROLL_MAX_SPEED * intensity * Math.max(0, elapsedMs) / 1000;
}

export type ReorderItem = { localId: string; text: string };
export type ChecklistRowLayout = { y: number; height: number };
export type ChecklistDragState = {
  localId: string;
  text: string;
  from: number;
  to: number;
  top: number;
  height: number;
};
type DragContext = ChecklistDragState & {
  previewTop: number;
  startCenterY: number;
  startPageY: number;
  startScrollY: number;
};

type ChecklistReorderOptions = {
  items: ReorderItem[];
  setItems: Dispatch<SetStateAction<ReorderItem[]>>;
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
};

export type ChecklistReorderMotion = {
  active: SharedValue<number>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  height: SharedValue<number>;
};

export function getReorderRowOffset(
  rowIndex: number,
  from: number,
  to: number,
  distance: number,
): number {
  'worklet';
  if (from < to && rowIndex > from && rowIndex <= to) return -distance;
  if (to < from && rowIndex >= to && rowIndex < from) return distance;
  return 0;
}

export function getDropTargetOffset(
  layouts: (ChecklistRowLayout | null)[],
  from: number,
  to: number,
): number {
  'worklet';
  const fromLayout = layouts[from];
  const toLayout = layouts[to];
  if (!fromLayout || !toLayout || from === to) return 0;
  const targetTop = to > from
    ? toLayout.y + toLayout.height - fromLayout.height
    : toLayout.y;
  return targetTop - fromLayout.y;
}

function getDropIndex(
  layouts: (ChecklistRowLayout | null)[],
  activeIndex: number,
  contentY: number,
): number {
  'worklet';
  let index = 0;
  for (let itemIndex = 0; itemIndex < layouts.length; itemIndex += 1) {
    if (itemIndex === activeIndex) continue;
    const layout = layouts[itemIndex];
    if (layout && contentY < layout.y + layout.height / 2) return index;
    index += 1;
  }
  return index;
}

export function useChecklistReorderRowStyle(
  rowIndex: number,
  motion: ChecklistReorderMotion,
) {
  const { active, from, to, height } = motion;
  const rowOffset = useSharedValue(0);
  useAnimatedReaction(
    () => active.value
      ? getReorderRowOffset(
          rowIndex,
          from.value,
          to.value,
          height.value + CHECKLIST_EDITOR_ROW_GAP,
        )
      : 0,
    (offset, previousOffset) => {
      if (!active.value) {
        cancelAnimation(rowOffset);
        rowOffset.value = 0;
        return;
      }
      if (offset !== previousOffset) {
        rowOffset.value = withTiming(offset, {
          duration: REORDER_ROW_DURATION_MS,
          easing: REORDER_ROW_EASING,
        });
      }
    },
  );
  return useAnimatedStyle(() => {
    return { transform: [{ translateY: rowOffset.value }] };
  });
}

function dragStateFrom(context: DragContext): ChecklistDragState {
  return {
    localId: context.localId,
    text: context.text,
    from: context.from,
    to: context.to,
    top: context.previewTop,
    height: context.height,
  };
}

export function animateEditorRows() {
  LayoutAnimation.configureNext({
    duration: 160,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity' },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity' },
  });
}

export function useChecklistReorder({
  items,
  setItems,
  scrollRef,
}: ChecklistReorderOptions) {
  const rowLayouts = useRef<(ChecklistRowLayout | null)[]>([]);
  const dragRef = useRef<DragContext | null>(null);
  const scrollY = useRef(0);
  const viewportTop = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const dragPageY = useRef<number | null>(null);
  const autoscrollFrame = useRef<number | null>(null);
  const lastAutoscrollTime = useRef<number | null>(null);
  const rowLayoutsValue = useSharedValue<(ChecklistRowLayout | null)[]>([]);
  const scrollYValue = useSharedValue(0);
  const viewportTopValue = useSharedValue(0);
  const viewportHeightValue = useSharedValue(0);
  const dragActive = useSharedValue(0);
  const dragFrom = useSharedValue(-1);
  const dragTarget = useSharedValue(-1);
  const dragHeight = useSharedValue(0);
  const dragStartPageY = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const dragNearEdge = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [drag, setDrag] = useState<ChecklistDragState | null>(null);
  const dragPreviewStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragOffset.value }],
  }));
  const dropTargetStyle = useAnimatedStyle(() => {
    const offset = dragActive.value
      ? getDropTargetOffset(
          rowLayoutsValue.value,
          dragFrom.value,
          dragTarget.value,
        )
      : 0;
    return {
      transform: [
        {
          translateY: withTiming(offset, {
            duration: REORDER_ROW_DURATION_MS,
            easing: REORDER_ROW_EASING,
          }),
        },
      ],
    };
  });

  const onRowLayout = (index: number, event: LayoutChangeEvent) => {
    if (dragRef.current) return;
    const { y, height } = event.nativeEvent.layout;
    rowLayouts.current[index] = { y, height };
    rowLayoutsValue.value = [...rowLayouts.current];
  };

  const dropIndexFor = (localId: string, contentY: number) => {
    let index = 0;
    const currentItems = itemsRef.current;
    for (let itemIndex = 0; itemIndex < currentItems.length; itemIndex += 1) {
      const item = currentItems[itemIndex];
      if (item.localId === localId) continue;
      const layout = rowLayouts.current[itemIndex];
      if (layout && contentY < layout.y + layout.height / 2) return index;
      index += 1;
    }
    return index;
  };

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

  const updateDragPosition = (pageY: number) => {
    const current = dragRef.current;
    if (!current) return;
    const contentY =
      current.startCenterY +
      (pageY - current.startPageY) +
      (scrollY.current - current.startScrollY);
    const to = dropIndexFor(current.localId, contentY);
    const targetChanged = to !== current.to;
    current.to = to;
    current.top = contentY - current.height / 2;
    dragOffset.value = current.top - current.previewTop;
    if (targetChanged) dragTarget.value = to;
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
    const currentItems = itemsRef.current;
    const index = currentItems.findIndex((item) => item.localId === localId);
    if (index < 0) return;
    const item = currentItems[index];
    const layout = rowLayouts.current[index];
    if (!layout || dragRef.current) return;

    Keyboard.dismiss();
    Vibration.vibrate(15);
    const current: DragContext = {
      localId: item.localId,
      text: item.text,
      from: index,
      to: index,
      top: layout.y,
      height: layout.height,
      previewTop: layout.y,
      startCenterY: layout.y + layout.height / 2,
      startPageY: pageY,
      startScrollY: scrollY.current,
    };
    if (!dragActive.value) {
      dragActive.value = 1;
      dragFrom.value = index;
      dragTarget.value = index;
      dragHeight.value = layout.height;
      dragStartPageY.value = pageY;
      dragStartScrollY.value = scrollY.current;
      dragNearEdge.value = 0;
    }
    dragOffset.value = 0;
    dragRef.current = current;
    setDrag(dragStateFrom(current));
  };

  const recordDragTarget = (to: number) => {
    if (dragRef.current) dragRef.current.to = to;
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

  const updateDragFromRN = (pageY: number) => {
    if (!dragRef.current) return;
    updateDragPosition(pageY);
    const viewportY = pageY - viewportTop.current;
    const nearEdge =
      viewportHeight.current > 0 &&
      (viewportY < EDGE_AUTOSCROLL_THRESHOLD ||
        viewportHeight.current - viewportY < EDGE_AUTOSCROLL_THRESHOLD);
    updateEdgeDrag(pageY, nearEdge);
  };

  const resetDragMotion = () => {
    dragActive.value = 0;
    dragFrom.value = -1;
    dragTarget.value = -1;
    dragHeight.value = 0;
    dragNearEdge.value = 0;
    dragOffset.value = 0;
  };

  const finishDrag = () => {
    const current = dragRef.current;
    dragRef.current = null;
    cancelEdgeAutoscroll();
    if (!current) return;
    setDrag(null);
    setItems((previous) => moveItem(previous, current.from, current.to));
    resetDragMotion();
  };

  const cancelDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    cancelEdgeAutoscroll();
    animateEditorRows();
    setDrag(null);
    resetDragMotion();
  };

  const moveItemByAction = (index: number, delta: -1 | 1) => {
    animateEditorRows();
    setItems((previous) => moveItem(previous, index, index + delta));
  };

  const gestureFor = (item: ReorderItem, itemIndex: number) =>
    Gesture.Pan()
      .withTestId(`item-hold-gesture-${item.localId}-${itemIndex}`)
      .activateAfterLongPress(CHECKLIST_REORDER_HOLD_MS)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .blocksExternalGesture(scrollRef as never)
      .onStart((event) => {
        'worklet';
        const layout = rowLayoutsValue.value[itemIndex];
        scheduleOnRN(startDrag, item.localId, event.absoluteY);
        if (!layout) return;
        dragActive.value = 1;
        dragFrom.value = itemIndex;
        dragTarget.value = itemIndex;
        dragHeight.value = layout.height;
        dragStartPageY.value = event.absoluteY;
        dragStartScrollY.value = scrollYValue.value;
        dragNearEdge.value = 0;
        dragOffset.value = 0;
      })
      .onUpdate((event) => {
        'worklet';
        const layout = rowLayoutsValue.value[itemIndex];
        if (!layout || !dragActive.value || dragFrom.value !== itemIndex) {
          scheduleOnRN(updateDragFromRN, event.absoluteY);
          return;
        }
        const contentY =
          layout.y + layout.height / 2 +
          (event.absoluteY - dragStartPageY.value) +
          (scrollYValue.value - dragStartScrollY.value);
        const to = getDropIndex(rowLayoutsValue.value, itemIndex, contentY);
        dragOffset.value = contentY - layout.height / 2 - layout.y;
        if (to !== dragTarget.value) {
          dragTarget.value = to;
          scheduleOnRN(recordDragTarget, to);
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
        scheduleOnRN(finishDrag);
      })
      .onFinalize((_event, success) => {
        'worklet';
        if (!success) scheduleOnRN(cancelDrag);
      });

  useEffect(
    () => () => {
      if (autoscrollFrame.current != null) {
        cancelAnimationFrame(autoscrollFrame.current);
      }
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
    dragPreviewStyle,
    dropTargetStyle,
    gestureFor,
    moveItemByAction,
    onRowLayout,
    onScroll,
    onViewportLayout,
    reorderMotion: {
      active: dragActive,
      from: dragFrom,
      to: dragTarget,
      height: dragHeight,
    },
    setContentHeight: (height: number) => {
      contentHeight.current = height;
    },
  };
}
