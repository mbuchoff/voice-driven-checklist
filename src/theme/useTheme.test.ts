import { dark, light } from './palette';
import { resolveTheme } from './useTheme';

describe('resolveTheme', () => {
  it('uses the approved Calm Guide color foundation', () => {
    expect(light).toMatchObject({
      background: '#fffdf9',
      surface: '#fffdf9',
      surfaceAlt: '#e2eee8',
      text: '#1f302b',
      textMuted: '#69756f',
      border: '#ded8cd',
      primary: '#245c49',
      accent: '#e97755',
    });
    expect(dark).toMatchObject({
      background: '#17241f',
      surface: '#17241f',
      surfaceAlt: '#243a31',
      text: '#f3f2eb',
      textMuted: '#a7b3ad',
      border: '#33443d',
      primary: '#78ad97',
      accent: '#f18f70',
    });
  });

  it('uses the system palette when the preference is System', () => {
    expect(resolveTheme('system', 'dark')).toBe(dark);
    expect(resolveTheme('system', 'light')).toBe(light);
  });

  it('lets an explicit preference override the system palette', () => {
    expect(resolveTheme('dark', 'light')).toBe(dark);
    expect(resolveTheme('light', 'dark')).toBe(light);
  });

  it('uses light when System has no usable color scheme', () => {
    expect(resolveTheme('system', 'unspecified')).toBe(light);
  });
});
