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
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { moveItem } from './reorder';

const HOLD_TO_REORDER_MS = 350;

export type ReorderItem = { localId: string; text: string };
type RowLayout = { y: number; height: number };
export type ChecklistDragState = {
  localId: string;
  text: string;
  from: number;
  to: number;
  top: number;
  height: number;
};
type DragContext = ChecklistDragState & {
  startCenterY: number;
  startPageY: number;
  startScrollY: number;
};

type ChecklistReorderOptions = {
  items: ReorderItem[];
  setItems: Dispatch<SetStateAction<ReorderItem[]>>;
  scrollRef: RefObject<ComponentRef<typeof ScrollView> | null>;
};

function dragStateFrom(context: DragContext): ChecklistDragState {
  return {
    localId: context.localId,
    text: context.text,
    from: context.from,
    to: context.to,
    top: context.top,
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
  const rowLayouts = useRef<RowLayout[]>([]);
  const dragRef = useRef<DragContext | null>(null);
  const scrollY = useRef(0);
  const viewportTop = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const dragBaseTop = useRef(0);
  const dragPageY = useRef<number | null>(null);
  const autoscrollFrame = useRef<number | null>(null);
  const dragOffset = useSharedValue(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [drag, setDrag] = useState<ChecklistDragState | null>(null);
  const dragPreviewStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragOffset.value }],
  }));

  const onRowLayout = (index: number, event: LayoutChangeEvent) => {
    if (dragRef.current) return;
    const { y, height } = event.nativeEvent.layout;
    rowLayouts.current[index] = { y, height };
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

  const autoscrollNearEdge = (pageY: number): boolean => {
    const maxY = Math.max(0, contentHeight.current - viewportHeight.current);
    if (!viewportHeight.current || !maxY) return false;

    const threshold = 56;
    const step = 32;
    const viewportY = pageY - viewportTop.current;
    let nextY = scrollY.current;
    if (viewportY < threshold) {
      nextY = Math.max(0, scrollY.current - step);
    } else if (viewportHeight.current - viewportY < threshold) {
      nextY = Math.min(maxY, scrollY.current + step);
    }
    if (nextY === scrollY.current) return false;

    scrollY.current = nextY;
    scrollRef.current?.scrollTo({ y: nextY, animated: false });
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
    if (!targetChanged) {
      dragOffset.value = current.top - dragBaseTop.current;
      return;
    }
    dragBaseTop.current = current.top;
    dragOffset.value = 0;
    animateEditorRows();
    setDrag(dragStateFrom(current));
  };

  const continueEdgeAutoscroll = () => {
    autoscrollFrame.current = null;
    const pageY = dragPageY.current;
    if (pageY == null || !dragRef.current) return;
    if (!autoscrollNearEdge(pageY)) return;
    updateDragPosition(pageY);
    autoscrollFrame.current = requestAnimationFrame(continueEdgeAutoscroll);
  };

  const cancelEdgeAutoscroll = () => {
    dragPageY.current = null;
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
      startCenterY: layout.y + layout.height / 2,
      startPageY: pageY,
      startScrollY: scrollY.current,
    };
    dragBaseTop.current = current.top;
    dragOffset.value = 0;
    animateEditorRows();
    dragRef.current = current;
    setDrag(dragStateFrom(current));
  };

  const updateDrag = (pageY: number) => {
    if (!dragRef.current) return;
    dragPageY.current = pageY;
    const scrolled = autoscrollNearEdge(pageY);
    updateDragPosition(pageY);
    if (scrolled && autoscrollFrame.current == null) {
      autoscrollFrame.current = requestAnimationFrame(continueEdgeAutoscroll);
    }
  };

  const finishDrag = () => {
    const current = dragRef.current;
    dragRef.current = null;
    cancelEdgeAutoscroll();
    if (!current) return;
    animateEditorRows();
    setDrag(null);
    setItems((previous) => moveItem(previous, current.from, current.to));
  };

  const cancelDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    cancelEdgeAutoscroll();
    animateEditorRows();
    setDrag(null);
  };

  const moveItemByAction = (index: number, delta: -1 | 1) => {
    animateEditorRows();
    setItems((previous) => moveItem(previous, index, index + delta));
  };

  const gestureFor = (item: ReorderItem) =>
    Gesture.Pan()
      .withTestId(`item-hold-gesture-${item.localId}`)
      .activateAfterLongPress(HOLD_TO_REORDER_MS)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .blocksExternalGesture(scrollRef as never)
      .runOnJS(true)
      .onStart((event) => startDrag(item.localId, event.absoluteY))
      .onUpdate((event) => updateDrag(event.absoluteY))
      .onEnd(finishDrag)
      .onFinalize((_event, success) => {
        if (!success) cancelDrag();
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
  };

  const onViewportLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    viewportTop.current = y;
    viewportHeight.current = height;
  };

  return {
    drag,
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
