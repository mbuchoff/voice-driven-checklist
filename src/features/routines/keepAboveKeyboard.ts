/**
 * Where to scroll the list so a step, chips and all, shows above the
 * keyboard, or null when it already does. `top`, `bottom` and `scrollY` are
 * in the list's content; `viewportTop` and `keyboardTop` are on the screen.
 * A step too tall for the room above the keyboard keeps its top in view.
 */
export function scrollToKeepAboveKeyboard({
  top,
  bottom,
  scrollY,
  viewportTop,
  keyboardTop,
  margin,
}: {
  top: number;
  bottom: number;
  scrollY: number;
  viewportTop: number;
  keyboardTop: number;
  margin: number;
}): number | null {
  const room = keyboardTop - viewportTop;
  let target = scrollY;
  if (bottom + margin > target + room) target = bottom + margin - room;
  if (top - margin < target) target = Math.max(0, top - margin);
  return target === scrollY ? null : target;
}
