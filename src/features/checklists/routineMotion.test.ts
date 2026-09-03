import { getRoutineGridMetrics } from './routineGrid';
import {
  getDirectionalDragTilt,
  getDisplacedRoutineSlot,
  getRoutineAutoScrollDelta,
  getRoutineRockingTilt,
  getRoutineTargetIndex,
} from './routineMotion';

describe('routine drag placement', () => {
  const layout = getRoutineGridMetrics(361, 6);

  it('maps the dragged center to a clamped grid position', () => {
    expect(getRoutineTargetIndex(87, 96, layout, 6)).toBe(0);
    expect(getRoutineTargetIndex(274, 300, layout, 6)).toBe(3);
    expect(getRoutineTargetIndex(87, 10_000, layout, 6)).toBe(4);
  });

  it('opens a slot by shifting every routine between source and target', () => {
    expect([0, 1, 2, 3, 4].map((slot) =>
      getDisplacedRoutineSlot(slot, 0, 4),
    )).toEqual([4, 0, 1, 2, 3]);
    expect([0, 1, 2, 3, 4].map((slot) =>
      getDisplacedRoutineSlot(slot, 4, 1),
    )).toEqual([0, 2, 3, 4, 1]);
  });
});

describe('routine edge autoscroll', () => {
  it('travels the same controlled distance at different refresh rates', () => {
    const distanceAt60Hz = Array.from(
      { length: 60 },
      () => getRoutineAutoScrollDelta(64, 1000 / 60),
    ).reduce((distance, delta) => distance + delta, 0);
    const distanceAt120Hz = Array.from(
      { length: 120 },
      () => getRoutineAutoScrollDelta(64, 1000 / 120),
    ).reduce((distance, delta) => distance + delta, 0);

    expect(distanceAt60Hz).toBeCloseTo(distanceAt120Hz, 5);
    expect(distanceAt60Hz).toBeGreaterThan(300);
    expect(distanceAt60Hz).toBeLessThan(800);
    expect(getRoutineAutoScrollDelta(0, 16)).toBe(0);
  });
});

describe('routine sway', () => {
  it('responds to the dominant direction and speed of a drag', () => {
    expect(getDirectionalDragTilt(500, 40)).toBe(1);
    expect(getDirectionalDragTilt(-500, 40)).toBe(-1);
    expect(getDirectionalDragTilt(20, -600)).toBe(-1);
    expect(getDirectionalDragTilt(0, 0)).toBe(0);
  });

  it('hands a restrained first settle into residual rocking before resting', () => {
    const initial = getRoutineRockingTilt(1, 0);
    const firstReturn = getRoutineRockingTilt(1, 160);
    const residual = getRoutineRockingTilt(1, 620);

    expect(initial).toBe(1);
    expect(firstReturn).toBeLessThan(0);
    expect(Math.abs(residual)).toBeGreaterThan(0.02);
    expect(getRoutineRockingTilt(1, 2200)).toBe(0);
  });
});
