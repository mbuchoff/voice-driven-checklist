// Frozen for migration 4: before colors were stored, a routine's card color
// came from a hash of its id into five colors (green, coral, blue, purple,
// olive), each mapped here to the nearest of the thirty routine colors. This
// must not change with the feature's colors, or old databases would migrate
// differently.
const LEGACY_COLOR_KEYS = ['green-2', 'orange-1', 'cyan-2', 'violet-2', 'lime-1'];

export function legacyRoutineColorKey(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100000;
  }
  return LEGACY_COLOR_KEYS[hash % LEGACY_COLOR_KEYS.length];
}
