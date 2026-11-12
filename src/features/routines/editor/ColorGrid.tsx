import { Pressable, View } from 'react-native';

import { Icon } from '@/src/components/Icon';

import type { EditorColors } from '../editorColors';
import { ROUTINE_COLORS, ROUTINE_COLOR_COLUMNS, routineColorShades, type RoutineColorKey } from '../routineColors';

/** The grid is at most this many dp per column wide. */
const COLUMN_SPACE = 54;

/**
 * The thirty routine colors as swatches in their deep shade, six to a row
 * (five neighboring hues and a neutral). The current color has a ring and ✓.
 */
export function ColorGrid({
  colors,
  selected,
  onPick,
}: {
  colors: EditorColors;
  selected: string;
  onPick: (key: RoutineColorKey) => void;
}) {
  const rows = [];
  for (let start = 0; start < ROUTINE_COLORS.length; start += ROUTINE_COLOR_COLUMNS) {
    rows.push(ROUTINE_COLORS.slice(start, start + ROUTINE_COLOR_COLUMNS));
  }
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Card color"
      style={{ width: '100%', maxWidth: ROUTINE_COLOR_COLUMNS * COLUMN_SPACE, gap: 2 }}
    >
      {rows.map((row) => (
        <View key={row[0].key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {row.map((entry) => {
            const ink = routineColorShades(entry.key, colors.mode).ink;
            const checked = entry.key === selected;
            return (
              <Pressable
                key={entry.key}
                testID={`swatch-${entry.key}`}
                accessibilityRole="radio"
                accessibilityLabel={entry.name}
                accessibilityState={{ checked }}
                onPress={() => onPick(entry.key)}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: colors.swatchRim,
                    backgroundColor: ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: checked
                      ? `0 0 0 2px ${ink}`
                      : '0 1px 3px rgba(28, 48, 41, 0.2)',
                  }}
                >
                  {checked ? <Icon name="check" color={colors.onInk} size={16} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** The dot that opens the colors: the routine's deep shade with a rim. */
export function ColorDot({
  colors,
  size,
  rim,
  label,
  onPress,
  testID,
  expanded,
}: {
  colors: EditorColors;
  size: number;
  rim: number;
  label: string;
  onPress: () => void;
  testID?: string;
  expanded?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: !!expanded }}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.ink,
          borderWidth: rim,
          borderColor: colors.mode === 'dark' ? colors.swatchRim : colors.surface,
          boxShadow: '0 1px 4px rgba(28, 48, 41, 0.25)',
        }}
      />
    </Pressable>
  );
}
