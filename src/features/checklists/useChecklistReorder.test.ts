import {
  beginChecklistDragRelease,
  getDropTargetOffset,
  getEdgeAutoscrollDelta,
  resetChecklistDragMotion,
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
  it('keeps displaced rows in place until the reordered layout commits', () => {
    const motion = {
      previewOffset: { value: 350 },
      previewOpacity: { value: 1 },
    };

    beginChecklistDragRelease(motion, 220);

    expect(motion).toEqual({
      previewOffset: { value: 220 },
      previewOpacity: { value: 0 },
    });
  });

  it('keeps the released preview at the pointer until React replaces it', () => {
    const motion = {
      active: { value: 1 },
      from: { value: 0 },
      to: { value: 2 },
      height: { value: 50 },
      nearEdge: { value: 1 },
      previewOffset: { value: 97 },
    };

    resetChecklistDragMotion(motion);

    expect(motion).toMatchObject({
      active: { value: 0 },
      from: { value: -1 },
      to: { value: -1 },
      height: { value: 0 },
      nearEdge: { value: 0 },
      previewOffset: { value: 97 },
    });
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
