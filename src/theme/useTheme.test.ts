import { dark, light } from './palette';
import { resolveTheme } from './useTheme';

describe('resolveTheme', () => {
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
