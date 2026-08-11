import {
  RUN_ITEM_GAP,
  getRunItemPresentation,
  getRunProgressPalette,
  getRunTrackOffset,
} from './runPresentation';

describe('run item presentation', () => {
  it('keeps each current item at the same focus position as the track advances', () => {
    for (let currentIndex = 0; currentIndex < 17; currentIndex += 1) {
      const itemPosition = currentIndex * RUN_ITEM_GAP;
      expect(itemPosition + getRunTrackOffset(currentIndex)).toBe(0);
    }
  });

  it('keeps the current item sharp and visually prominent', () => {
    expect(getRunItemPresentation(4, 4, 36)).toEqual({
      opacity: 1,
      scale: 1,
      blurRadius: 0,
    });
    expect(getRunItemPresentation(3, 4, 36).opacity).toBeLessThan(1);
    expect(getRunItemPresentation(3, 4, 36).scale).toBeLessThan(1);
  });

  it('uses native blur on API 31+ and the opacity/scale fallback below it', () => {
    expect(getRunItemPresentation(3, 4, 31).blurRadius).toBeGreaterThan(0);
    expect(getRunItemPresentation(3, 4, 30).blurRadius).toBe(0);
    expect(getRunItemPresentation(3, 4, 30).opacity).toBeLessThan(1);
    expect(getRunItemPresentation(3, 4, 30).scale).toBeLessThan(1);
  });

  it('uses the approved solid center and track behind progress', () => {
    expect(getRunProgressPalette('dark')).toEqual({
      surface: '#193f34',
      track: 'rgba(255, 255, 255, 0.14)',
      shadow: '0 12px 32px rgba(7, 32, 24, 0.24)',
    });
    expect(getRunProgressPalette('light')).toEqual({
      surface: '#fffaf3',
      track: 'rgba(23, 56, 46, 0.12)',
      shadow: '0 13px 34px rgba(43, 74, 61, 0.13)',
    });
  });
});
