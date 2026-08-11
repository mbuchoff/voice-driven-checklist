import {
  getDropTargetOffset,
  getEdgeAutoscrollDelta,
  getReorderRowOffset,
} from './useChecklistReorder';

describe('checklist edge autoscroll', () => {
  it('travels the same controlled distance at different display refresh rates', () => {
    const distanceAt60Hz = Array.from(
      { length: 60 },
      () => getEdgeAutoscrollDelta(56, 1000 / 60),
    ).reduce(
      (distance, delta) => distance + delta,
      0,
    );
    const distanceAt90Hz = Array.from(
      { length: 90 },
      () => getEdgeAutoscrollDelta(56, 1000 / 90),
    ).reduce(
      (distance, delta) => distance + delta,
      0,
    );

    expect(distanceAt60Hz).toBeCloseTo(distanceAt90Hz, 5);
    expect(distanceAt60Hz).toBeGreaterThan(300);
    expect(distanceAt60Hz).toBeLessThan(700);
  });

  it('slows as the pointer moves away from the edge', () => {
    expect(getEdgeAutoscrollDelta(14, 16)).toBeLessThan(
      getEdgeAutoscrollDelta(56, 16),
    );
    expect(getEdgeAutoscrollDelta(0, 16)).toBe(0);
  });
});

describe('checklist row motion', () => {
  it('slides only the rows displaced by a downward drag', () => {
    expect(getReorderRowOffset(0, 0, 2, 59)).toBe(0);
    expect(getReorderRowOffset(1, 0, 2, 59)).toBe(-59);
    expect(getReorderRowOffset(2, 0, 2, 59)).toBe(-59);
    expect(getReorderRowOffset(3, 0, 2, 59)).toBe(0);
  });

  it('slides only the rows displaced by an upward drag', () => {
    expect(getReorderRowOffset(0, 3, 1, 59)).toBe(0);
    expect(getReorderRowOffset(1, 3, 1, 59)).toBe(59);
    expect(getReorderRowOffset(2, 3, 1, 59)).toBe(59);
    expect(getReorderRowOffset(3, 3, 1, 59)).toBe(0);
  });

  it('places the insertion target correctly among variable-height rows', () => {
    const layouts = [
      { y: 0, height: 70 },
      { y: 79, height: 50 },
      { y: 138, height: 90 },
    ];

    expect(getDropTargetOffset(layouts, 0, 2)).toBe(158);
    expect(getDropTargetOffset(layouts, 2, 1)).toBe(-59);
    expect(getDropTargetOffset(layouts, 2, 0)).toBe(-138);
  });
});
