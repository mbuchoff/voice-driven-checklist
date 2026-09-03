import type { RoutineGridMetrics } from './routineGrid';

const AUTOSCROLL_EDGE_SIZE = 64;
const AUTOSCROLL_MAX_SPEED = 540;
const FULL_TILT_SPEED = 420;
const VERTICAL_SWAY_WEIGHT = 0.9;

const ROCKING = {
  startFrequencyHz: 2.4,
  endFrequencyHz: 1.15,
  startDecayRate: 5,
  endDecayRate: 1.8,
  handoffDelayMs: 210,
  handoffTransitionMs: 160,
  durationMs: 2100,
} as const;

export function getRoutineTargetIndex(
  centerX: number,
  centerY: number,
  layout: RoutineGridMetrics,
  itemCount: number,
) {
  'worklet';
  if (itemCount <= 0) return 0;
  const localX = centerX - layout.leftOffset;
  const column = Math.max(
    0,
    Math.min(
      layout.columns - 1,
      Math.floor((localX + layout.gap / 2) / (layout.cardWidth + layout.gap)),
    ),
  );
  const lastRow = Math.floor((itemCount - 1) / layout.columns);
  const row = Math.max(
    0,
    Math.min(
      lastRow,
      Math.floor((centerY + layout.gap / 2) / (layout.cardHeight + layout.gap)),
    ),
  );
  const target = row * layout.columns + column;
  return Math.min(itemCount - 1, target);
}

export function getDisplacedRoutineSlot(
  slot: number,
  from: number,
  to: number,
) {
  'worklet';
  if (slot === from) return to;
  if (from < to && slot > from && slot <= to) return slot - 1;
  if (to < from && slot >= to && slot < from) return slot + 1;
  return slot;
}

export function getRoutineAutoScrollDelta(
  distanceIntoEdge: number,
  elapsedMs: number,
) {
  'worklet';
  const intensity = Math.min(
    1,
    Math.max(0, distanceIntoEdge) / AUTOSCROLL_EDGE_SIZE,
  );
  return AUTOSCROLL_MAX_SPEED * intensity * Math.max(0, elapsedMs) / 1000;
}

export function getDirectionalDragTilt(velocityX: number, velocityY: number) {
  'worklet';
  const vertical = velocityY * VERTICAL_SWAY_WEIGHT;
  const directional =
    Math.abs(velocityX) >= Math.abs(vertical) ? velocityX : vertical;
  return Math.max(-1, Math.min(1, directional / FULL_TILT_SPEED));
}

export function getRoutineRockingTilt(
  initialTilt: number,
  elapsedMs: number,
) {
  'worklet';
  if (elapsedMs <= 0) return initialTilt;
  if (elapsedMs >= ROCKING.durationMs) return 0;
  const handoffSeconds = ROCKING.handoffDelayMs / 1000;
  const tailSeconds = Math.max(
    0,
    (elapsedMs - ROCKING.handoffDelayMs) / 1000,
  );
  const transitionSeconds = ROCKING.handoffTransitionMs / 1000;
  const integratedTailRate = (startRate: number, endRate: number) => {
    'worklet';
    return (
      endRate * tailSeconds +
      (startRate - endRate) *
        transitionSeconds *
        (1 - Math.exp(-tailSeconds / transitionSeconds))
    );
  };
  const phaseCycles =
    ROCKING.startFrequencyHz *
      Math.min(elapsedMs / 1000, handoffSeconds) +
    integratedTailRate(ROCKING.startFrequencyHz, ROCKING.endFrequencyHz);
  const decayExponent =
    ROCKING.startDecayRate *
      Math.min(elapsedMs / 1000, handoffSeconds) +
    integratedTailRate(ROCKING.startDecayRate, ROCKING.endDecayRate);
  return (
    initialTilt *
    Math.exp(-decayExponent) *
    Math.cos(2 * Math.PI * phaseCycles)
  );
}

export const ROUTINE_AUTOSCROLL_EDGE_SIZE = AUTOSCROLL_EDGE_SIZE;
export const ROUTINE_ROCKING_DURATION_MS = ROCKING.durationMs;
