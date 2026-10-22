import type { Palette } from '@/src/theme/palette';

export type RoutineColorShades = {
  /** Card and folded-bar background, timed clock pill, selected chip. */
  fill: string;
  /** Badge numbers, counts, the open step's bar, filled buttons. */
  ink: string;
  /** Page background behind the editor. */
  tint: string;
};

export type RoutineColor = {
  key: string;
  name: string;
  light: RoutineColorShades;
  dark: RoutineColorShades;
};

function color(
  key: string,
  name: string,
  [lightFill, lightInk, lightTint, darkFill, darkInk, darkTint]: string[],
): RoutineColor {
  return {
    key,
    name,
    light: { fill: lightFill, ink: lightInk, tint: lightTint },
    dark: { fill: darkFill, ink: darkInk, tint: darkTint },
  };
}

// The approved prototype's thirty colors, generated in OKLCH and converted
// to sRGB by rendering them in Chrome. Grid order: each row is five
// neighboring hues followed by one neutral.
export const ROUTINE_COLORS: readonly RoutineColor[] = [
  color('pink-1', 'pink 1', ['#ffdae5', '#7a354d', '#fff0f4', '#3c232a', '#f3adc2', '#1b1013']),
  color('pink-2', 'pink 2', ['#ffdbdd', '#7d353f', '#fff1f1', '#3d2325', '#f6aeb3', '#1c1011']),
  color('red-1', 'red 1', ['#ffdcd5', '#7e372e', '#fff1ee', '#3d2420', '#f6b0a5', '#1c100f']),
  color('orange-1', 'orange 1', ['#ffddcf', '#7c3a1d', '#fff2ec', '#3c251b', '#f4b398', '#1c110d']),
  color('orange-2', 'orange 2', ['#fee0c9', '#773f05', '#fff3ea', '#3a2617', '#eeb78d', '#1b120b']),
  color('taupe', 'taupe', ['#eee4e0', '#5f4b43', '#f8f4f3', '#312927', '#d3bfb8', '#161312']),
  color('amber-1', 'amber 1', ['#fae2c6', '#714500', '#fdf3e8', '#382814', '#e7bc87', '#19120a']),
  color('amber-2', 'amber 2', ['#f4e5c5', '#684a00', '#faf5e8', '#342a13', '#ddc184', '#181309']),
  color('yellow-1', 'yellow 1', ['#ece8c6', '#5c5000', '#f7f6e8', '#302c13', '#d0c685', '#161409']),
  color('lime-1', 'lime 1', ['#e5eac9', '#4f5500', '#f4f7e9', '#2b2e16', '#c2cb8b', '#13150a']),
  color('lime-2', 'lime 2', ['#dcedce', '#3d5a16', '#f1f8eb', '#252f1a', '#b2d095', '#11160c']),
  color('stone', 'stone', ['#e7e6e2', '#51504a', '#f5f5f4', '#2c2b29', '#c6c4be', '#141413']),
  color('green-1', 'green 1', ['#d5efd4', '#285d29', '#eef9ee', '#1f311e', '#a3d3a1', '#0e160e']),
  color('green-2', 'green 2', ['#cef0db', '#01603a', '#ecf9f1', '#193124', '#95d5af', '#0c1710']),
  color('mint-1', 'mint 1', ['#c9f1e3', '#00614a', '#eaf9f4', '#133229', '#88d7bf', '#0a1713']),
  color('teal-1', 'teal 1', ['#c5f1eb', '#006059', '#e8f9f7', '#0f322f', '#80d6cd', '#091715']),
  color('teal-2', 'teal 2', ['#c4f0f3', '#005f67', '#e8f9fa', '#0e3134', '#7dd5dc', '#081618']),
  color('gray', 'gray', ['#e6e6e6', '#505050', '#f5f5f5', '#2b2b2b', '#c4c4c4', '#141414']),
  color('cyan-1', 'cyan 1', ['#c5eefa', '#005c72', '#e8f9fd', '#103038', '#81d2e7', '#09161a']),
  color('cyan-2', 'cyan 2', ['#c9edff', '#00587c', '#eaf8ff', '#142f3b', '#89cff1', '#0a161b']),
  color('blue-1', 'blue 1', ['#ceeaff', '#105483', '#ecf7ff', '#192d3e', '#95caf8', '#0c151c']),
  color('blue-2', 'blue 2', ['#d5e8ff', '#2c4f86', '#eef6ff', '#1f2c3f', '#a3c6fc', '#0e141d']),
  color('indigo-1', 'indigo 1', ['#dce5ff', '#3f4a86', '#f1f5ff', '#252a3f', '#b3c1fc', '#11131d']),
  color('sage-gray', 'sage gray', ['#e2e8e5', '#49524d', '#f3f6f4', '#292c2a', '#bdc7c1', '#131413']),
  color('violet-1', 'violet 1', ['#e4e2ff', '#4e4583', '#f4f4ff', '#2a283e', '#c1bcf9', '#13121c']),
  color('violet-2', 'violet 2', ['#ebe0ff', '#5a417d', '#f7f3ff', '#2f273c', '#ceb8f3', '#15121b']),
  color('purple-1', 'purple 1', ['#f3defb', '#663c74', '#faf2fd', '#332539', '#dbb3e9', '#17111a']),
  color('purple-2', 'purple 2', ['#f9dcf4', '#6e3969', '#fdf1fb', '#372435', '#e5b0de', '#191118']),
  color('magenta-1', 'magenta 1', ['#fedbed', '#75365b', '#fff1f8', '#3a2330', '#edaed0', '#1a1016']),
  color('slate', 'slate', ['#e3e6ec', '#49505b', '#f3f5f8', '#292b2f', '#bec5cf', '#131416']),
];

const BY_KEY = new Map(ROUTINE_COLORS.map((entry) => [entry.key, entry]));

export const ROUTINE_COLOR_COLUMNS = 6;

export function isRoutineColorKey(key: unknown): key is string {
  return typeof key === 'string' && BY_KEY.has(key);
}

export function routineColor(key: string): RoutineColor {
  return BY_KEY.get(key) ?? BY_KEY.get(LEGACY_COLOR_KEYS[0])!;
}

export function routineColorShades(
  key: string,
  mode: Palette['mode'],
): RoutineColorShades {
  return routineColor(key)[mode];
}

// Before colors were stored, a routine's card color came from a hash of its
// id into five colors (green, coral, blue, purple, olive). Each maps to the
// nearest hue of the thirty.
const LEGACY_COLOR_KEYS = ['green-2', 'orange-1', 'cyan-2', 'violet-2', 'lime-1'];

export function legacyRoutineColorKey(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100000;
  }
  return LEGACY_COLOR_KEYS[hash % LEGACY_COLOR_KEYS.length];
}

/** A random color for a new routine, avoiding `avoid` while any color is left. */
export function pickRoutineColorKey(
  avoid: readonly string[],
  random: () => number = Math.random,
): string {
  const avoided = new Set(avoid);
  const candidates = ROUTINE_COLORS.filter((entry) => !avoided.has(entry.key));
  const pool = candidates.length > 0 ? candidates : ROUTINE_COLORS;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].key;
}
