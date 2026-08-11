import { getEdgeAutoscrollDelta } from './useChecklistReorder';

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
