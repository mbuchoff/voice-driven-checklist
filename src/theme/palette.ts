export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  inputBorder: string;
  primary: string;
  onPrimary: string;
  danger: string;
  disabled: string;
  accent: string;
  accentSoft: string;
  success: string;
  shadow: string;
  runBackground: string;
  runSurface: string;
  runBorder: string;
}

export const light: Palette = {
  background: '#fbf8f2',
  surface: '#fffdf9',
  surfaceAlt: '#e9f1ec',
  text: '#20332c',
  textMuted: '#6d7a75',
  textSubtle: '#52655e',
  border: '#ded6c9',
  inputBorder: '#d8d0c4',
  primary: '#22634f',
  onPrimary: '#ffffff',
  danger: '#b94d35',
  disabled: '#aab3af',
  accent: '#f28b6d',
  accentSoft: '#fde3d9',
  success: '#3c826b',
  shadow: 'rgba(40, 52, 45, 0.12)',
  runBackground: '#eef3ed',
  runSurface: '#fffdf9',
  runBorder: '#dbe4dc',
};

export const dark: Palette = {
  background: '#102f27',
  surface: '#173a30',
  surfaceAlt: '#21463b',
  text: '#fffaf1',
  textMuted: '#b8c8c1',
  textSubtle: '#d8e3de',
  border: '#45675d',
  inputBorder: '#527268',
  primary: '#f39a7b',
  onPrimary: '#16372e',
  danger: '#ff9b80',
  disabled: '#536b64',
  accent: '#f39a7b',
  accentSoft: '#68483e',
  success: '#8ebda9',
  shadow: 'rgba(0, 0, 0, 0.28)',
  runBackground: '#123c31',
  runSurface: '#20483c',
  runBorder: '#4f7066',
};
