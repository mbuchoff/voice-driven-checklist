import { dark, light } from '@/src/theme/palette';

import {
  ROUTINE_COLORS,
  isRoutineColorKey,
  pickRoutineColorKey,
  routineColorShades,
} from './routineColors';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

describe('routine colors', () => {
  it('offers thirty distinct colors, each with light and dark shades', () => {
    const keys = ROUTINE_COLORS.map((color) => color.key);
    expect(new Set(keys).size).toBe(30);
    for (const key of keys) {
      expect(isRoutineColorKey(key)).toBe(true);
      expect(routineColorShades(key, 'light')).not.toEqual(routineColorShades(key, 'dark'));
    }
    expect(isRoutineColorKey('coral')).toBe(false);
  });

  it('picks a new routine color that avoids the colors it is told to avoid', () => {
    const avoided = ROUTINE_COLORS.slice(0, 6).map((color) => color.key);
    for (const random of [0, 0.25, 0.5, 0.999]) {
      const picked = pickRoutineColorKey(avoided, () => random);
      expect(isRoutineColorKey(picked)).toBe(true);
      expect(avoided).not.toContain(picked);
    }
  });

  it('still picks a color when every color is in use', () => {
    const everything = ROUTINE_COLORS.map((color) => color.key);
    expect(isRoutineColorKey(pickRoutineColorKey(everything, () => 0.4))).toBe(true);
  });

  it('keeps text readable on every color in both themes', () => {
    const unreadable: string[] = [];
    for (const [theme, onInk] of [[light, '#ffffff'], [dark, '#101a16']] as const) {
      for (const { key } of ROUTINE_COLORS) {
        const shades = routineColorShades(key, theme.mode);
        // Card title and step text sit on the fill or the page tint; counts,
        // badges and the selected chip put the ink on the fill; filled
        // buttons put their label on the ink.
        const pairs = {
          'text on fill': contrast(theme.text, shades.fill),
          'text on tint': contrast(theme.text, shades.tint),
          'ink on fill': contrast(shades.ink, shades.fill),
          'label on ink': contrast(onInk, shades.ink),
        };
        for (const [pair, ratio] of Object.entries(pairs)) {
          if (ratio < 4.5) unreadable.push(`${key} ${theme.mode} ${pair}: ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(unreadable).toEqual([]);
  });
});
