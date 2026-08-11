export const RUN_ITEM_GAP = 152;

export type RunItemPresentation = {
  opacity: number;
  scale: number;
  blurRadius: number;
};

export function getRunProgressPalette(mode: 'light' | 'dark') {
  return mode === 'light'
    ? {
        surface: '#fffaf3',
        track: 'rgba(23, 56, 46, 0.12)',
        centerBorder: 'rgba(23, 56, 46, 0.06)',
        shadow: '0 13px 34px rgba(43, 74, 61, 0.13)',
      }
    : {
        surface: '#193f34',
        track: 'rgba(255, 255, 255, 0.14)',
        centerBorder: 'transparent',
        shadow: '0 12px 32px rgba(7, 32, 24, 0.24)',
      };
}

export function getRunTrackOffset(currentIndex: number): number {
  'worklet';
  return -currentIndex * RUN_ITEM_GAP;
}

export function getRunItemPresentation(
  itemIndex: number,
  currentIndex: number,
  androidApi: number,
): RunItemPresentation {
  return getRunItemPresentationAtPosition(itemIndex, currentIndex, androidApi);
}

export function getRunItemPresentationAtPosition(
  itemIndex: number,
  currentPosition: number,
  androidApi: number,
): RunItemPresentation {
  'worklet';
  const distance = Math.abs(itemIndex - currentPosition);
  if (distance === 0) {
    return { opacity: 1, scale: 1, blurRadius: 0 };
  }

  if (distance < 1) {
    return {
      opacity: 1 - 0.66 * distance,
      scale: 1 - 0.18 * distance,
      blurRadius: androidApi >= 31 ? 3.05 * distance : 0,
    };
  }

  return {
    opacity: Math.max(0.12, 0.34 - Math.min(distance - 1, 4) * 0.045),
    scale: Math.max(0.72, 0.82 - Math.min(distance - 1, 3) * 0.025),
    blurRadius: androidApi >= 31 ? Math.min(4, 2.8 + distance * 0.25) : 0,
  };
}
