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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { moveItem } from './reorder';

export const CHECKLIST_REORDER_HOLD_MS = 350;
export const CHECKLIST_REORDER_RELEASE_MS = 120;
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
};

type ChecklistReorderOptions = {
  items: ReorderItem[];
  setItems: Dispatch<SetStateAction<ReorderItem[]>>;
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
};

export function getDropTargetOffset(
  layouts: (ChecklistRowLayout | null)[],
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

function animateReorderRows() {
  LayoutAnimation.configureNext({
    duration: REORDER_ROW_DURATION_MS,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
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
  const dragStartPageY = useSharedValue(0);
  const dragStartScrollY = useSharedValue(0);
  const dragNearEdge = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  const dragPreviewOpacity = useSharedValue(1);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [drag, setDrag] = useState<ChecklistDragState | null>(null);
  const [settlingPreview, setSettlingPreview] =
    useState<ChecklistDragState | null>(null);
  const dragPreview = drag ?? settlingPreview;
  const dragPreviewStyle = useAnimatedStyle(() => ({
    opacity: dragPreviewOpacity.value,
    transform: [{ translateY: dragOffset.value }],
  }));

  const onRowLayout = (index: number, event: LayoutChangeEvent) => {
    if (dragRef.current) return;
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
    if (!current) return;
    if (current.to === to) return;
    current.to = to;
    dragTarget.value = to;
    animateReorderRows();
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
    const currentItems = itemsRef.current;
    const index = currentItems.findIndex((item) => item.localId === localId);
    if (index < 0) return;
    const item = currentItems[index];
    const layout = rowLayouts.current[index];
    if (!layout || dragRef.current) return;

    Keyboard.dismiss();
    Vibration.vibrate(15);
    setSettlingPreview(null);
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
    };
    dragRef.current = current;
    setDrag(dragStateFrom(current));
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

  const resetDragMotion = () => {
    dragActive.value = 0;
    dragFrom.value = -1;
    dragTarget.value = -1;
    dragNearEdge.value = 0;
  };

  const completeDragRelease = (localId: string) => {
    setSettlingPreview((current) =>
      current?.localId === localId ? null : current,
    );
  };

  const finishDrag = (localId: string) => {
    const current = dragRef.current;
    if (!current || current.localId !== localId) return;
    dragRef.current = null;
    cancelEdgeAutoscroll();
    const targetOffset = getDropTargetOffset(
      rowLayouts.current,
      current.from,
      current.to,
    );
    setDrag(null);
    setSettlingPreview(dragStateFrom(current));
    setItems((previous) => moveItem(previous, current.from, current.to));
    dragOffset.value = withTiming(targetOffset, {
      duration: CHECKLIST_REORDER_RELEASE_MS,
      easing: REORDER_ROW_EASING,
    });
    dragPreviewOpacity.value = withTiming(
      0,
      {
        duration: CHECKLIST_REORDER_RELEASE_MS,
        easing: REORDER_ROW_EASING,
      },
      (finished) => {
        if (finished) scheduleOnRN(completeDragRelease, current.localId);
      },
    );
    // Keep the preview offset under animation control until the reordered rows
    // commit; the next drag initializes it from zero.
    resetDragMotion();
  };

  const cancelDrag = (localId: string) => {
    if (dragRef.current?.localId !== localId) return;
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
        if (!layout || dragActive.value) return;
        dragActive.value = 1;
        dragFrom.value = itemIndex;
        dragTarget.value = itemIndex;
        dragStartPageY.value = event.absoluteY;
        dragStartScrollY.value = scrollYValue.value;
        dragNearEdge.value = 0;
        dragPreviewOpacity.value = 1;
        dragOffset.value = 0;
        scheduleOnRN(startDrag, item.localId, event.absoluteY);
      })
      .onUpdate((event) => {
        'worklet';
        const layout = rowLayoutsValue.value[itemIndex];
        if (!layout || !dragActive.value || dragFrom.value !== itemIndex) {
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
        if (dragFrom.value === itemIndex) {
          scheduleOnRN(finishDrag, item.localId);
        }
      })
      .onFinalize((_event, success) => {
        'worklet';
        if (!success && dragFrom.value === itemIndex) {
          scheduleOnRN(cancelDrag, item.localId);
        }
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
