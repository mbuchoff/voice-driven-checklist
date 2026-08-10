export const RUN_ITEM_GAP = 152;

export type RunItemPresentation = {
  opacity: number;
  scale: number;
  blurRadius: number;
};

export function getRunTrackOffset(currentIndex: number): number {
  return -currentIndex * RUN_ITEM_GAP;
}

export function getRunItemPresentation(
  itemIndex: number,
  currentIndex: number,
  androidApi: number,
): RunItemPresentation {
  const distance = Math.abs(itemIndex - currentIndex);
  if (distance === 0) {
    return { opacity: 1, scale: 1, blurRadius: 0 };
  }

  return {
    opacity: Math.max(0.12, 0.34 - Math.min(distance - 1, 4) * 0.045),
    scale: Math.max(0.72, 0.82 - Math.min(distance - 1, 3) * 0.025),
    blurRadius: androidApi >= 31 ? Math.min(4, 2.8 + distance * 0.25) : 0,
  };
}
