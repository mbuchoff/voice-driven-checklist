/**
 * One step row's geometry. The word glide and the open step's chips line up
 * with it, so these are derived from each other rather than repeated.
 */

/** The steps' list sits this far in from the screen's sides. */
export const LIST_PAD_X = 16;
/** The row's front reaches this far past the row's sides. */
export const ROW_BLEED = 16;
/** The front's padding. */
export const ROW_PAD_X = 24;
export const ROW_PAD_Y = 6;
/** Where the number starts, from the row's edge. */
export const CONTENT_LEFT = ROW_PAD_X - ROW_BLEED;
/** The space between the number, the words and the time. */
export const ROW_GAP = 8;
/** The step number's badge. */
export const BADGE_SIZE = 30;
/** The time's badge. */
export const TIME_BADGE_HEIGHT = 34;

/** A step's words, as the row shows them. */
export const STEP_WORDS = { fontSize: 20, lineHeight: 26 } as const;
/** The padding around the words in their text box. */
export const TEXT_PAD = { x: 6, y: 11 } as const;
/** The words in their text box: the field, the label and the glide's stand-ins. */
export const STEP_TEXT_BOX = {
  ...STEP_WORDS,
  paddingHorizontal: TEXT_PAD.x,
  paddingVertical: TEXT_PAD.y,
} as const;

/** Where an open step's words start, from the row's edge. */
export const EDIT_INSET = 18;
/**
 * The number's place closes to this (a negative margin) when a step opens,
 * so its words start at EDIT_INSET.
 */
export const OPEN_BADGE_MARGIN = EDIT_INSET - TEXT_PAD.x - ROW_GAP - CONTENT_LEFT;
/** How far the text box's left edge moves when a step opens. */
export const OPEN_BOX_SHIFT = OPEN_BADGE_MARGIN - BADGE_SIZE;
/** The open step's chips start where its words' text box does. */
export const CHIP_STRIP_INSET = EDIT_INSET - CONTENT_LEFT;

/**
 * The room for an open step's chips in a row `rowWidth` wide: the front's
 * width inside its padding, less the strip's inset.
 */
export function chipStripRoom(rowWidth: number): number {
  return rowWidth + 2 * ROW_BLEED - 2 * ROW_PAD_X - CHIP_STRIP_INSET;
}
