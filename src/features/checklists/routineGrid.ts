const CARD_GAP = 12;
const FULL_CARD_HEIGHT = 240;
const COMPACT_CARD_HEIGHT = 192;
const MIN_CARD_WIDTH = 280;
const MAX_CARD_WIDTH = 360;
const COMPACT_GRID_MAX_WIDTH = 599;
const COMPACT_TWO_COLUMN_MIN_WIDTH = 330;
const FULL_PLAY_BUTTON_SIZE = 56;
const FULL_PLAY_BUTTON_INSET = 14;
const COMPACT_PLAY_BUTTON_SIZE = 46;
const COMPACT_PLAY_BUTTON_INSET = 10;

export function getRoutineGridMetrics(gridWidth: number, itemCount: number) {
  const width = Math.max(1, gridWidth);
  const compact = width <= COMPACT_GRID_MAX_WIDTH;
  const columns = compact
    ? width >= COMPACT_TWO_COLUMN_MIN_WIDTH
      ? 2
      : 1
    : Math.max(
        1,
        Math.floor((width + CARD_GAP) / (MIN_CARD_WIDTH + CARD_GAP)),
      );
  const availableCardWidth =
    (width - CARD_GAP * (columns - 1)) / columns;
  const cardWidth = compact
    ? availableCardWidth
    : Math.min(MAX_CARD_WIDTH, availableCardWidth);
  const cardHeight = compact ? COMPACT_CARD_HEIGHT : FULL_CARD_HEIGHT;
  const playButtonSize = compact
    ? COMPACT_PLAY_BUTTON_SIZE
    : FULL_PLAY_BUTTON_SIZE;
  const playButtonInset = compact
    ? COMPACT_PLAY_BUTTON_INSET
    : FULL_PLAY_BUTTON_INSET;
  const contentBottomPadding = 15;
  const contentWidth = columns * cardWidth + CARD_GAP * (columns - 1);
  const leftOffset = Math.max(0, (width - contentWidth) / 2);
  const rows = itemCount > 0 ? Math.ceil(itemCount / columns) : 0;
  const gridHeight =
    rows > 0 ? rows * (cardHeight + CARD_GAP) - CARD_GAP : 0;

  return {
    columns,
    cardWidth,
    cardHeight,
    compact,
    playButtonSize,
    playButtonInset,
    contentBottomPadding,
    contentWidth,
    leftOffset,
    gridHeight,
    gap: CARD_GAP,
  };
}

export type RoutineGridMetrics = ReturnType<typeof getRoutineGridMetrics>;

export function getRoutinePosition(
  index: number,
  layout: RoutineGridMetrics,
) {
  'worklet';
  return {
    x:
      layout.leftOffset +
      (index % layout.columns) * (layout.cardWidth + layout.gap),
    y:
      Math.floor(index / layout.columns) *
      (layout.cardHeight + layout.gap),
  };
}
