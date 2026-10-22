import type { Palette } from '@/src/theme/palette';

import { routineColorShades } from './routineColors';

/** CSS `color-mix(in srgb, a weight, b)` for #rrggbb colors. */
export function mixColors(a: string, b: string, weightOfA: number): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2]
    .map((index) => Math.round(channel(a, index) * weightOfA + channel(b, index) * (1 - weightOfA)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

export type EditorColors = {
  mode: Palette['mode'];
  /** The routine's colors. */
  fill: string;
  ink: string;
  tint: string;
  /** Label color on the ink (✓, +, Save). */
  onInk: string;
  /** The open step's background. */
  editTint: string;
  /** The gap a held step leaves while it's dragged. */
  dragSlot: string;
  text: string;
  muted: string;
  /** Muted text that stays readable on the page tint. */
  muted2: string;
  border: string;
  divider: string;
  surface: string;
  surfaceSoft: string;
  primary: string;
  onPrimary: string;
  danger: string;
  onDanger: string;
  shadow: string;
  scrim: string;
  swatchRim: string;
};

// The prototype's editor tokens. Where they differ from the app palette
// (labels on filled buttons in dark mode, muted text), the prototype's are
// the readable ones.
const EDITOR_TOKENS = {
  light: {
    onInk: '#ffffff',
    onPrimary: '#ffffff',
    onDanger: '#ffffff',
    muted2: '#5d6964',
    divider: '#ece6dc',
    swatchRim: '#fffdf9',
  },
  dark: {
    onInk: '#101a16',
    onPrimary: '#101a16',
    onDanger: '#101a16',
    muted2: '#a7b3ad',
    divider: '#2a3a34',
    swatchRim: 'rgba(243, 242, 235, 0.35)',
  },
} as const;

export function editorColors(theme: Palette, colorKey: string): EditorColors {
  const shades = routineColorShades(colorKey, theme.mode);
  const tokens = EDITOR_TOKENS[theme.mode];
  return {
    mode: theme.mode,
    fill: shades.fill,
    ink: shades.ink,
    tint: shades.tint,
    onInk: tokens.onInk,
    editTint: mixColors(shades.fill, theme.surface, 0.65),
    dragSlot: mixColors(shades.fill, theme.surface, 0.45),
    text: theme.text,
    muted: theme.textMuted,
    muted2: tokens.muted2,
    border: theme.border,
    divider: tokens.divider,
    surface: theme.surface,
    surfaceSoft: theme.surfaceSoft,
    primary: theme.primary,
    onPrimary: tokens.onPrimary,
    danger: theme.danger,
    onDanger: tokens.onDanger,
    shadow: theme.shadow,
    scrim: 'rgba(16, 26, 22, 0.42)',
    swatchRim: tokens.swatchRim,
  };
}
