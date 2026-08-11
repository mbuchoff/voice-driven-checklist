import {
  RUN_ITEM_GAP,
  RUN_TRANSITION_DURATION_MS,
  RUN_TRANSITION_EASING,
  getRunItemStatus,
  getRunItemPresentation,
  getRunProgressPalette,
  getRunTrackOffset,
} from './runPresentation';

describe('run item presentation', () => {
  it('keeps run movement within the approved gentle transition range', () => {
    expect(RUN_TRANSITION_DURATION_MS).toBeGreaterThanOrEqual(420);
    expect(RUN_TRANSITION_DURATION_MS).toBeLessThanOrEqual(500);
    expect(RUN_TRANSITION_EASING.factory).toEqual(expect.any(Function));
  });

  it('keeps each current item at the same focus position as the track advances', () => {
    for (let currentIndex = 0; currentIndex < 17; currentIndex += 1) {
      const itemPosition = currentIndex * RUN_ITEM_GAP;
      expect(itemPosition + getRunTrackOffset(currentIndex)).toBe(0);
    }
  });

  it('keeps the current item sharp and visually prominent', () => {
    expect(getRunItemPresentation('upcoming', 1, 36)).toEqual({
      opacity: 1,
      scale: 1,
      blurRadius: 0,
    });
    expect(getRunItemPresentation('past', 0, 36).opacity).toBeLessThan(1);
    expect(getRunItemPresentation('past', 0, 36).scale).toBeLessThan(1);
  });

  it('uses native blur on API 31+ and the opacity/scale fallback below it', () => {
    expect(getRunItemPresentation('past', 0, 31).blurRadius).toBeGreaterThan(0);
    expect(getRunItemPresentation('past', 0, 30).blurRadius).toBe(0);
    expect(getRunItemPresentation('past', 0, 30).opacity).toBeLessThan(1);
    expect(getRunItemPresentation('past', 0, 30).scale).toBeLessThan(1);
  });

  it('moves incoming and outgoing rows smoothly between their endpoints', () => {
    for (const background of ['past', 'upcoming'] as const) {
      const backgroundPresentation = getRunItemPresentation(background, 0, 36);
      const transitioning = getRunItemPresentation(background, 0.5, 36);
      const current = getRunItemPresentation(background, 1, 36);

      expect(transitioning.opacity).toBeGreaterThan(backgroundPresentation.opacity);
      expect(transitioning.opacity).toBeLessThan(current.opacity);
      expect(transitioning.scale).toBeGreaterThan(backgroundPresentation.scale);
      expect(transitioning.scale).toBeLessThan(current.scale);
      expect(transitioning.blurRadius).toBeGreaterThan(current.blurRadius);
      expect(transitioning.blurRadius).toBeLessThan(backgroundPresentation.blurRadius);
    }
  });

  it('changes emphasis on only the outgoing and incoming rows', () => {
    const before = Array.from({ length: 17 }, (_, index) =>
      getRunItemStatus(index, 8),
    );
    const after = Array.from({ length: 17 }, (_, index) =>
      getRunItemStatus(index, 9),
    );

    expect(
      before.flatMap((status, index) => status === after[index] ? [] : [index]),
    ).toEqual([8, 9]);
    expect(before[12]).toBe('upcoming');
    expect(after[12]).toBe('upcoming');
  });

  it('uses the approved solid center and track behind progress', () => {
    expect(getRunProgressPalette('dark')).toEqual({
      surface: '#193f34',
      track: 'rgba(255, 255, 255, 0.14)',
      fill: '#ef916f',
      labelOpacity: 0.64,
      centerBorder: 'transparent',
      shadow: '0 12px 32px rgba(7, 32, 24, 0.24)',
    });
    expect(getRunProgressPalette('light')).toEqual({
      surface: '#fffaf3',
      track: 'rgba(23, 56, 46, 0.12)',
      fill: '#ef916f',
      labelOpacity: 0.56,
      centerBorder: 'rgba(23, 56, 46, 0.06)',
      shadow: '0 13px 34px rgba(43, 74, 61, 0.13)',
    });
  });
});
