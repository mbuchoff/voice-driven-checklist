import {
  getDropTargetOffset,
  getEdgeAutoscrollDelta,
  getOwnPlaceShift,
} from './useStepReorder';

describe('routine edge autoscroll', () => {
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

describe('routine row placement', () => {
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

  it('lands a step dropped in its own place where that place has moved while it was held', () => {
    // Step 1 was open (110 tall) and closed; step 4 is held.
    const before = [{ y: 0, height: 110 }, { y: 110, height: 50 }, { y: 160, height: 50 }, { y: 210, height: 50 }];
    const after = [{ y: 0, height: 50 }, { y: 50, height: 50 }, { y: 100, height: 50 }, before[3]];
    expect(getOwnPlaceShift(before, after, 3)).toBe(-60);

    // An UNDO row above the held first step went: the step below shows how far.
    const belowBefore = [{ y: 52, height: 50 }, { y: 102, height: 50 }];
    const belowAfter = [belowBefore[0], { y: 50, height: 50 }];
    expect(getOwnPlaceShift(belowBefore, belowAfter, 0)).toBe(-52);

    expect(getOwnPlaceShift(before, before, 2)).toBe(0);
  });

  it('lands a held first step in its own place when only its height changed while held', () => {
    // It was the open step (110 tall) and closed to 50; the step below moved up by that much.
    const before = [{ y: 0, height: 110 }, { y: 110, height: 50 }];
    const after = [{ y: 0, height: 50 }, { y: 50, height: 50 }];
    expect(getOwnPlaceShift(before, after, 0)).toBe(0);
  });
});
