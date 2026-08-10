import type { SoundPreference } from '@/src/features/settings/preferences';

export const CUE_ACTIONS = ['next', 'previous', 'repeat', 'complete'] as const;
export type CueAction = (typeof CUE_ACTIONS)[number];

export const SOUND_OPTIONS: readonly {
  id: SoundPreference;
  label: string;
  detail: string;
}[] = [
  { id: 'chime', label: 'Soft Chime', detail: 'Warm and gentle' },
  { id: 'wood', label: 'Wooden Tap', detail: 'Soft and tactile' },
  { id: 'ping', label: 'Bright Ping', detail: 'Clear and upbeat' },
  { id: 'quiet', label: 'Quiet', detail: 'No sounds' },
];
