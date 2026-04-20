export interface Palette {
  background: string;
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
}

export const light: Palette = {
  background: '#ffffff',
  surfaceAlt: '#f1f1f1',
  text: '#000000',
  textMuted: '#666666',
  textSubtle: '#444444',
  border: '#dddddd',
  inputBorder: '#cccccc',
  primary: '#0a84ff',
  onPrimary: '#ffffff',
  danger: '#a0431f',
  disabled: '#bbbbbb',
};

export const dark: Palette = {
  background: '#000000',
  surfaceAlt: '#2c2c2e',
  text: '#ffffff',
  textMuted: '#9a9a9e',
  textSubtle: '#e0e0e0',
  border: '#3a3a3c',
  inputBorder: '#48484a',
  primary: '#0a84ff',
  onPrimary: '#ffffff',
  danger: '#ff6b4a',
  disabled: '#48484a',
};
