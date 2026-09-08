import { getRoutineGridMetrics } from './routineGrid';

describe('getRoutineGridMetrics', () => {
  it('uses two fixed-height cards per row on supported phone widths', () => {
    const layout = getRoutineGridMetrics(361, 5);

    expect(layout.columns).toBe(2);
    expect(layout.cardHeight).toBe(192);
    expect(layout.cardWidth).toBe(174.5);
    expect(layout.gridHeight).toBe(600);
  });

  it('uses one column when two usable cards would not fit', () => {
    const layout = getRoutineGridMetrics(300, 2);

    expect(layout.columns).toBe(1);
    expect(layout.cardWidth).toBe(300);
    expect(layout.gridHeight).toBe(396);
  });

  it('adds centered, bounded columns as wider screens allow', () => {
    const tablet = getRoutineGridMetrics(800, 8);
    const desktop = getRoutineGridMetrics(1248, 8);

    expect(tablet.columns).toBe(2);
    expect(tablet.cardWidth).toBe(360);
    expect(tablet.leftOffset).toBe(34);
    expect(desktop.columns).toBe(4);
    expect(desktop.cardWidth).toBeLessThanOrEqual(360);
    expect(desktop.contentWidth).toBeLessThanOrEqual(1248);
  });
});
