/**
 * Round 27's picks for a long step's words when its number and time make
 * room (or come back) and the words change lines: each word takes 160 ms,
 * quick then gentle, starting 12 ms after the one before it. Words that keep
 * their line slide there; words that change lines fade out where they were
 * and fade in where they land.
 */
export const WORD_GLIDE_MS = 160;
export const WORD_GLIDE_STAGGER_MS = 12;

/** A word's place in its text box: its line, and where it starts on it. */
export type WordSpot = { x: number; line: number };

/** How a word gets from its old spot to its new one, offset (dx, dy) from it. */
export type WordMove = {
  kind: 'slide' | 'fade';
  dx: number;
  dy: number;
  delay: number;
};

/**
 * Plans each word's move when the text box moves `boxShift` along the row
 * and changes width. Null when no word changes lines: then the words just
 * ride along with their box.
 */
export function planWordGlide(
  before: readonly WordSpot[],
  after: readonly WordSpot[],
  boxShift: number,
  lineHeight: number,
): WordMove[] | null {
  if (before.length !== after.length || before.every((spot, i) => spot.line === after[i].line)) return null;
  return before.map((spot, i) => ({
    kind: spot.line === after[i].line ? 'slide' : 'fade',
    dx: spot.x - after[i].x - boxShift,
    dy: (spot.line - after[i].line) * lineHeight,
    delay: i * WORD_GLIDE_STAGGER_MS,
  }));
}

/** From the first word starting to the last one landing. */
export function glideLength(wordCount: number): number {
  return WORD_GLIDE_MS + Math.max(0, wordCount - 1) * WORD_GLIDE_STAGGER_MS;
}

/** How far along the word at `index` is, `elapsed` ms after the first started. */
export function wordProgress(elapsed: number, index: number, easing: (t: number) => number): number {
  'worklet';
  const t = (elapsed - index * WORD_GLIDE_STAGGER_MS) / WORD_GLIDE_MS;
  return easing(Math.min(1, Math.max(0, t)));
}

/**
 * A word that changes lines: out where it was over the first 45% of its
 * move, unseen for a moment, then in where it lands.
 */
export function fadeThrough(progress: number): { opacity: number; atStart: boolean } {
  'worklet';
  if (progress < 0.45) return { opacity: 1 - progress / 0.45, atStart: true };
  if (progress < 0.55) return { opacity: 0, atStart: false };
  return { opacity: 1 - (1 - progress) / 0.45, atStart: false };
}
