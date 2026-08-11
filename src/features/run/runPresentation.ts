import { Easing } from 'react-native-reanimated';

export const RUN_ITEM_GAP = 152;
export const RUN_TRANSITION_DURATION_MS = 440;
export const RUN_TRANSITION_EASING = Easing.bezier(0.22, 0.75, 0.2, 1);
export const RUN_TRANSITION_CONFIG = {
  duration: RUN_TRANSITION_DURATION_MS,
  easing: RUN_TRANSITION_EASING,
};

export type RunItemStatus = 'past' | 'current' | 'upcoming';
export type RunItemBackgroundStatus = Exclude<RunItemStatus, 'current'>;

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
        fill: '#ef916f',
        labelOpacity: 0.56,
        centerBorder: 'rgba(23, 56, 46, 0.06)',
        shadow: '0 13px 34px rgba(43, 74, 61, 0.13)',
      }
    : {
        surface: '#193f34',
        track: 'rgba(255, 255, 255, 0.14)',
        fill: '#ef916f',
        labelOpacity: 0.64,
        centerBorder: 'transparent',
        shadow: '0 12px 32px rgba(7, 32, 24, 0.24)',
      };
}

export function getRunTrackOffset(currentIndex: number): number {
  'worklet';
  return -currentIndex * RUN_ITEM_GAP;
}

export function getRunItemStatus(
  itemIndex: number,
  currentIndex: number,
): RunItemStatus {
  if (itemIndex < currentIndex) return 'past';
  if (itemIndex > currentIndex) return 'upcoming';
  return 'current';
}

export function getRunItemPresentation(
  backgroundStatus: RunItemBackgroundStatus,
  focusProgress: number,
  androidApi: number,
): RunItemPresentation {
  'worklet';
  const progress = Math.max(0, Math.min(focusProgress, 1));
  const backgroundOpacity = backgroundStatus === 'past' ? 0.13 : 0.23;
  const backgroundScale = 0.82;
  return {
    opacity: backgroundOpacity + (1 - backgroundOpacity) * progress,
    scale: backgroundScale + (1 - backgroundScale) * progress,
    blurRadius: androidApi >= 31 ? 3.05 * (1 - progress) : 0,
  };
}
