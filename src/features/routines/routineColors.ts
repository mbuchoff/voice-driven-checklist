import type { Palette } from '@/src/theme/palette';

export type RoutineColorShades = {
  /** Card and folded-bar background, timed clock pill, selected chip. */
  fill: string;
  /** Badge numbers, counts, the open step's bar, filled buttons. */
  ink: string;
  /** Page background behind the editor. */
  tint: string;
};

export type RoutineColor<Key extends string = RoutineColorKey> = {
  key: Key;
  /** What TalkBack calls it: "violet 1". */
  name: string;
  light: RoutineColorShades;
  dark: RoutineColorShades;
};

function color<Key extends string>(
  key: Key,
  [lightFill, lightInk, lightTint, darkFill, darkInk, darkTint]: string[],
): RoutineColor<Key> {
  return {
    key,
    name: key.replace('-', ' '),
    light: { fill: lightFill, ink: lightInk, tint: lightTint },
    dark: { fill: darkFill, ink: darkInk, tint: darkTint },
  };
}

// The approved prototype's thirty colors, generated in OKLCH and converted
// to sRGB by rendering them in Chrome. Grid order: each row is five
// neighboring hues followed by one neutral.
export const ROUTINE_COLORS = [
  color('pink-1', ['#ffdae5', '#7a354d', '#fff0f4', '#3c232a', '#f3adc2', '#1b1013']),
  color('pink-2', ['#ffdbdd', '#7d353f', '#fff1f1', '#3d2325', '#f6aeb3', '#1c1011']),
  color('red-1', ['#ffdcd5', '#7e372e', '#fff1ee', '#3d2420', '#f6b0a5', '#1c100f']),
  color('orange-1', ['#ffddcf', '#7c3a1d', '#fff2ec', '#3c251b', '#f4b398', '#1c110d']),
  color('orange-2', ['#fee0c9', '#773f05', '#fff3ea', '#3a2617', '#eeb78d', '#1b120b']),
  color('taupe', ['#eee4e0', '#5f4b43', '#f8f4f3', '#312927', '#d3bfb8', '#161312']),
  color('amber-1', ['#fae2c6', '#714500', '#fdf3e8', '#382814', '#e7bc87', '#19120a']),
  color('amber-2', ['#f4e5c5', '#684a00', '#faf5e8', '#342a13', '#ddc184', '#181309']),
  color('yellow-1', ['#ece8c6', '#5c5000', '#f7f6e8', '#302c13', '#d0c685', '#161409']),
  color('lime-1', ['#e5eac9', '#4f5500', '#f4f7e9', '#2b2e16', '#c2cb8b', '#13150a']),
  color('lime-2', ['#dcedce', '#3d5a16', '#f1f8eb', '#252f1a', '#b2d095', '#11160c']),
  color('stone', ['#e7e6e2', '#51504a', '#f5f5f4', '#2c2b29', '#c6c4be', '#141413']),
  color('green-1', ['#d5efd4', '#285d29', '#eef9ee', '#1f311e', '#a3d3a1', '#0e160e']),
  color('green-2', ['#cef0db', '#01603a', '#ecf9f1', '#193124', '#95d5af', '#0c1710']),
  color('mint-1', ['#c9f1e3', '#00614a', '#eaf9f4', '#133229', '#88d7bf', '#0a1713']),
  color('teal-1', ['#c5f1eb', '#006059', '#e8f9f7', '#0f322f', '#80d6cd', '#091715']),
  color('teal-2', ['#c4f0f3', '#005f67', '#e8f9fa', '#0e3134', '#7dd5dc', '#081618']),
  color('gray', ['#e6e6e6', '#505050', '#f5f5f5', '#2b2b2b', '#c4c4c4', '#141414']),
  color('cyan-1', ['#c5eefa', '#005c72', '#e8f9fd', '#103038', '#81d2e7', '#09161a']),
  color('cyan-2', ['#c9edff', '#00587c', '#eaf8ff', '#142f3b', '#89cff1', '#0a161b']),
  color('blue-1', ['#ceeaff', '#105483', '#ecf7ff', '#192d3e', '#95caf8', '#0c151c']),
  color('blue-2', ['#d5e8ff', '#2c4f86', '#eef6ff', '#1f2c3f', '#a3c6fc', '#0e141d']),
  color('indigo-1', ['#dce5ff', '#3f4a86', '#f1f5ff', '#252a3f', '#b3c1fc', '#11131d']),
  color('sage-gray', ['#e2e8e5', '#49524d', '#f3f6f4', '#292c2a', '#bdc7c1', '#131413']),
  color('violet-1', ['#e4e2ff', '#4e4583', '#f4f4ff', '#2a283e', '#c1bcf9', '#13121c']),
  color('violet-2', ['#ebe0ff', '#5a417d', '#f7f3ff', '#2f273c', '#ceb8f3', '#15121b']),
  color('purple-1', ['#f3defb', '#663c74', '#faf2fd', '#332539', '#dbb3e9', '#17111a']),
  color('purple-2', ['#f9dcf4', '#6e3969', '#fdf1fb', '#372435', '#e5b0de', '#191118']),
  color('magenta-1', ['#fedbed', '#75365b', '#fff1f8', '#3a2330', '#edaed0', '#1a1016']),
  color('slate', ['#e3e6ec', '#49505b', '#f3f5f8', '#292b2f', '#bec5cf', '#131416']),
] as const;

/** One of the thirty routine colors. */
export type RoutineColorKey = (typeof ROUTINE_COLORS)[number]['key'];

const BY_KEY = new Map<string, RoutineColor>(ROUTINE_COLORS.map((entry) => [entry.key, entry]));

export const ROUTINE_COLOR_COLUMNS = 6;

export function isRoutineColorKey(key: unknown): key is RoutineColorKey {
  return typeof key === 'string' && BY_KEY.has(key);
}

/** What a stored color this version doesn't know shows as: the color column's default. */
const FALLBACK_COLOR_KEY: RoutineColorKey = 'green-2';

/** A color read from storage, where it was checked when written but may come from a later version. */
export function storedRoutineColorKey(stored: string): RoutineColorKey {
  return isRoutineColorKey(stored) ? stored : FALLBACK_COLOR_KEY;
}

export function routineColor(key: RoutineColorKey): RoutineColor {
  return BY_KEY.get(key)!;
}

export function routineColorShades(
  key: RoutineColorKey,
  mode: Palette['mode'],
): RoutineColorShades {
  return routineColor(key)[mode];
}

/** A random color for a new routine, avoiding `avoid` while any color is left. */
export function pickRoutineColorKey(
  avoid: readonly string[],
  random: () => number = Math.random,
): RoutineColorKey {
  const avoided = new Set(avoid);
  const candidates = ROUTINE_COLORS.filter((entry) => !avoided.has(entry.key));
  const pool = candidates.length > 0 ? candidates : ROUTINE_COLORS;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].key;
}
