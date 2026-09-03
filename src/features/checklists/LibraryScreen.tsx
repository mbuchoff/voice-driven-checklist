import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/src/components/Icon';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useTheme } from '@/src/theme/useTheme';

import { listChecklists } from './repository';
import { RoutineCard } from './RoutineCard';
import {
  getRoutineGridMetrics,
  getRoutinePosition,
} from './routineGrid';
import type { ChecklistSummary } from './types';
import { useRoutineSelectionFeedback } from './useRoutineSelectionFeedback';

export type LibraryScreenProps = {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onStart: (id: string) => void;
  onSettings?: () => void;
  /** Refreshes routines after returning from another screen. */
  refreshKey?: number;
};

function HeaderControl({
  accessibilityLabel,
  filled,
  icon,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  filled?: boolean;
  icon: 'plus' | 'settings';
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const selection = useRoutineSelectionFeedback('control', onPress);

  return (
    <Animated.View
      testID={`${testID}-feedback`}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: filled ? theme.primary : 'transparent',
        transform: [
          { translateY: selection.translateY },
          { scale: selection.scale },
        ],
      }}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={selection.run}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon
          name={icon}
          color={filled ? theme.onPrimary : theme.textMuted}
          size={icon === 'plus' ? 20 : 19}
          strokeWidth={icon === 'plus' ? 2.4 : 2}
          testID={icon === 'settings' ? 'settings-icon' : undefined}
        />
      </Pressable>
    </Animated.View>
  );
}

export function LibraryScreen({
  onCreate,
  onEdit,
  onStart,
  onSettings,
  refreshKey,
}: LibraryScreenProps) {
  const db = useDatabase();
  const theme = useTheme();
  const window = useWindowDimensions();
  const [items, setItems] = useState<ChecklistSummary[]>([]);
  const [gridWidth, setGridWidth] = useState(() =>
    Math.max(1, window.width - 32),
  );

  const refresh = useCallback(() => {
    listChecklists(db).then(setItems);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    setGridWidth(Math.max(1, window.width - 32));
  }, [window.width]);

  const layout = useMemo(
    () => getRoutineGridMetrics(gridWidth, items.length),
    [gridWidth, items.length],
  );

  const handleGridLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && Math.abs(nextWidth - gridWidth) > 1) {
      setGridWidth(nextWidth);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="library-safe-area"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        testID="library-scroll"
        stickyHeaderIndices={[0]}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 48,
        }}
      >
        <View
          testID="library-header"
          style={{
            marginHorizontal: -16,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 6,
            minHeight: 58,
            backgroundColor: theme.background,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            zIndex: 30,
            elevation: 8,
            boxShadow: `0 5px 12px ${theme.shadow}`,
          }}
        >
          <Text
            style={{
              flex: 1,
              color: theme.text,
              fontSize: 27,
              fontWeight: '700',
              letterSpacing: -1.2,
            }}
          >
            Routines
          </Text>
          <HeaderControl
            accessibilityLabel="New checklist"
            filled
            icon="plus"
            onPress={onCreate}
            testID="new-checklist"
          />
          <HeaderControl
            accessibilityLabel="Settings"
            icon="settings"
            onPress={() => onSettings?.()}
            testID="open-settings"
          />
        </View>

        {items.length === 0 ? (
          <View
            testID="library-empty-state"
            style={{
              marginTop: 20,
              minHeight: 160,
              padding: 22,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.surface,
            }}
          >
            <Text
              style={{
                color: theme.text,
                fontSize: 18,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              No routines yet
            </Text>
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 14,
                lineHeight: 20,
                textAlign: 'center',
                marginTop: 6,
              }}
            >
              Use + to create your first voice checklist.
            </Text>
          </View>
        ) : (
          <View
            testID="routine-grid"
            onLayout={handleGridLayout}
            style={{
              height: layout.gridHeight,
              marginTop: 16,
            }}
          >
            {items.map((item, index) => {
              const position = getRoutinePosition(index, layout);
              return (
                <View
                  key={item.id}
                  testID={`routine-position-${item.id}`}
                  style={{
                    position: 'absolute',
                    left: position.x,
                    top: position.y,
                  }}
                >
                  <RoutineCard
                    item={item}
                    layout={layout}
                    theme={theme}
                    onEdit={() => onEdit(item.id)}
                    onStart={() => onStart(item.id)}
                  />
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
