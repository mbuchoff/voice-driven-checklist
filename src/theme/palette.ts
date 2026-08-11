export interface Palette {
  mode: 'light' | 'dark';
  canvas: string;
  canvasDeep: string;
  background: string;
  surface: string;
  surfaceSoft: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textFaint: string;
  border: string;
  inputBorder: string;
  primary: string;
  primaryDark: string;
  onPrimary: string;
  danger: string;
  disabled: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  success: string;
  shadow: string;
  runBackground: string;
  runSurface: string;
  runBorder: string;
  runText: string;
  runTextMuted: string;
}

export const light: Palette = {
  mode: 'light',
  canvas: '#f5f1e9',
  canvasDeep: '#e9e1d4',
  background: '#fffdf9',
  surface: '#fffdf9',
  surfaceSoft: '#faf6ef',
  surfaceAlt: '#e2eee8',
  text: '#1f302b',
  textMuted: '#69756f',
  textSubtle: '#69756f',
  textFaint: '#9aa39f',
  border: '#ded8cd',
  inputBorder: '#ded8cd',
  primary: '#245c49',
  primaryDark: '#173d31',
  onPrimary: '#ffffff',
  danger: '#b44c3e',
  disabled: '#9aa39f',
  accent: '#e97755',
  accentDark: '#bd4d30',
  accentSoft: '#fdf0eb',
  success: '#3e6c55',
  shadow: 'rgba(28, 48, 41, 0.12)',
  runBackground: '#edf1e9',
  runSurface: 'rgba(255, 253, 249, 0.72)',
  runBorder: 'rgba(23, 56, 46, 0.13)',
  runText: '#17382e',
  runTextMuted: 'rgba(23, 56, 46, 0.57)',
};

export const dark: Palette = {
  mode: 'dark',
  canvas: '#101a16',
  canvasDeep: '#0b120f',
  background: '#17241f',
  surface: '#17241f',
  surfaceSoft: '#1d2d27',
  surfaceAlt: '#243a31',
  text: '#f3f2eb',
  textMuted: '#a7b3ad',
  textSubtle: '#a7b3ad',
  textFaint: '#78867f',
  border: '#33443d',
  inputBorder: '#33443d',
  primary: '#78ad97',
  primaryDark: '#92c3ae',
  onPrimary: '#ffffff',
  danger: '#ff9a8d',
  disabled: '#78867f',
  accent: '#f18f70',
  accentDark: '#f0a187',
  accentSoft: '#332723',
  success: '#99c5ac',
  shadow: 'rgba(0, 0, 0, 0.28)',
  runBackground: '#15352c',
  runSurface: 'rgba(255, 255, 255, 0.06)',
  runBorder: 'rgba(255, 255, 255, 0.15)',
  runText: '#f8f4eb',
  runTextMuted: 'rgba(248, 244, 235, 0.56)',
};
