const CARD_GAP = 12;
const MIN_CARD_WIDTH = 280;
const MAX_CARD_WIDTH = 360;
const COMPACT_GRID_MAX_WIDTH = 599;
const COMPACT_TWO_COLUMN_MIN_WIDTH = 330;
const COMPACT_TYPOGRAPHY = {
  title: { fontSize: 18, lineHeight: 22, letterSpacing: -0.35 },
  count: { fontSize: 14, marginTop: 4 },
  steps: { fontSize: 14, lineHeight: 17, marginTop: 6, paddingTop: 6 },
  playIconSize: 19,
};
const FULL_TYPOGRAPHY = {
  title: { fontSize: 22, lineHeight: 26, letterSpacing: -0.6 },
  count: { fontSize: 15, marginTop: 5 },
  steps: { fontSize: 15, lineHeight: 19, marginTop: 8, paddingTop: 8 },
  playIconSize: 22,
};
const COMPACT = { cardHeight: 192, playButtonSize: 46, playButtonInset: 10, typography: COMPACT_TYPOGRAPHY };
const FULL = { cardHeight: 240, playButtonSize: 56, playButtonInset: 14, typography: FULL_TYPOGRAPHY };

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
  const preset = compact ? COMPACT : FULL;
  const contentWidth = columns * cardWidth + CARD_GAP * (columns - 1);
  const leftOffset = Math.max(0, (width - contentWidth) / 2);
  const rows = itemCount > 0 ? Math.ceil(itemCount / columns) : 0;
  const gridHeight =
    rows > 0 ? rows * (preset.cardHeight + CARD_GAP) - CARD_GAP : 0;

  return {
    columns,
    cardWidth,
    ...preset,
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
