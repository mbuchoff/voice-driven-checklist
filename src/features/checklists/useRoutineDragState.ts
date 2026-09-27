import { useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import type { RoutineScrollThresholds } from './routineMotion';
import type { LibraryChecklist } from './types';

export type SlotMap = Record<string, number>;

export function mapRoutineSlots(items: LibraryChecklist[]): SlotMap {
  return Object.fromEntries(items.map((item, index) => [item.id, index]));
}

// A stable bundle of independently animated values: updating pointer coordinates
// must not cancel tilt/release animations or invalidate unrelated subscribers.
export function useRoutineDragState(items: LibraryChecklist[]) {
  return useRef({
    slots: useSharedValue<SlotMap>(mapRoutineSlots(items)),
    initialSlots: useSharedValue<SlotMap>(mapRoutineSlots(items)),
    activeId: useSharedValue(''),
    holdOwner: useSharedValue(''),
    selectionCancelled: useSharedValue<Record<string, boolean>>({}),
    holdProgress: useSharedValue(0),
    fromIndex: useSharedValue(-1),
    targetIndex: useSharedValue(0),
    startX: useSharedValue(0),
    startY: useSharedValue(0),
    dragX: useSharedValue(0),
    dragY: useSharedValue(0),
    dragTilt: useSharedValue(0),
    dragging: useSharedValue(0),
    settleInitialTilt: useSharedValue(0),
    dragStartScrollY: useSharedValue(0),
    commandedScrollY: useSharedValue(0),
    lastFrameTimestamp: useSharedValue<number | null>(null),
    pointerAbsoluteY: useSharedValue(0),
    viewportTop: useSharedValue(0),
    dragScrollDelta: useSharedValue(0),
    dragLift: useSharedValue(1),
    dragGeneration: useSharedValue(0),
    holdActivation: useSharedValue(0),
    holdStartX: useSharedValue(0),
    holdStartY: useSharedValue(0),
    edgeThresholds: useSharedValue<RoutineScrollThresholds>({ top: 0, bottom: 0 }),
    idleMotionMs: useSharedValue(0),
  }).current;
}

export type RoutineDragState = ReturnType<typeof useRoutineDragState>;
