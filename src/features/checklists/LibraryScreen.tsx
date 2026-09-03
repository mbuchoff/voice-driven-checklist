import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView as NativeScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Reanimated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/src/components/Icon';
import { notify } from '@/src/components/confirm';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useRoutineReorderHintPreference } from '@/src/features/settings/DevicePreferencesProvider';
import { useTheme } from '@/src/theme/useTheme';

import { moveItem } from './reorder';
import { listChecklists, reorderChecklists } from './repository';
import {
  RoutineArrangeHint,
  RoutineArrangeLesson,
  shouldShowRoutineArrangeHint,
} from './RoutineArrangeHint';
import { getRoutineGridMetrics } from './routineGrid';
import { RoutineReorderGrid } from './RoutineReorderGrid';
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
  const {
    dismissed: reorderHintDismissed,
    dismiss: dismissReorderHint,
  } = useRoutineReorderHintPreference();
  const window = useWindowDimensions();
  const [items, setItems] = useState<ChecklistSummary[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [gridWidth, setGridWidth] = useState(() =>
    Math.max(1, window.width - 32),
  );
  const itemsRef = useRef(items);
  const persistedItems = useRef(items);
  const savingOrderRef = useRef(false);
  const gridRef = useRef<View>(null);
  const lessonMeasureFallback = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [lessonOrigin, setLessonOrigin] = useState<{
    x: number;
    y: number;
  }>();
  const scrollRef = useAnimatedRef<NativeScrollView>();
  const scrollY = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  itemsRef.current = items;

  const refresh = useCallback(() => {
    listChecklists(db).then((loaded) => {
      persistedItems.current = loaded;
      setItems(loaded);
    });
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

  const handleGridWidth = (nextWidth: number) => {
    if (nextWidth > 0 && Math.abs(nextWidth - gridWidth) > 1) {
      setGridWidth(nextWidth);
    }
  };

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const persistOrder = useCallback(
    async (orderedIds: string[]) => {
      if (savingOrderRef.current) return false;
      const byId = new Map(itemsRef.current.map((item) => [item.id, item]));
      const orderedItems = orderedIds
        .map((id) => byId.get(id))
        .filter((item): item is ChecklistSummary => item !== undefined);
      if (orderedItems.length !== itemsRef.current.length) return false;

      const previous = persistedItems.current;
      savingOrderRef.current = true;
      setSavingOrder(true);
      setItems(orderedItems);
      try {
        await reorderChecklists(db, orderedIds);
        persistedItems.current = orderedItems;
        return true;
      } catch {
        setItems(previous);
        await notify(
          'Couldn’t save order',
          'Your routines were restored to their previous order.',
        );
        return false;
      } finally {
        savingOrderRef.current = false;
        setSavingOrder(false);
      }
    },
    [db],
  );

  const moveByAccessibility = useCallback(
    async (id: string, delta: -1 | 1) => {
      const current = itemsRef.current;
      const from = current.findIndex((item) => item.id === id);
      if (from < 0) return;
      const to = Math.max(0, Math.min(current.length - 1, from + delta));
      if (from === to) return;
      const ordered = moveItem(current, from, to);
      const saved = await persistOrder(ordered.map((item) => item.id));
      if (!saved) return;
      const moved = ordered[to];
      AccessibilityInfo.announceForAccessibility(
        `${moved.title}, position ${to + 1} of ${ordered.length}`,
      );
    },
    [persistOrder],
  );

  const openArrangeLesson = useCallback(() => {
    const grid = gridRef.current;
    if (!grid?.measureInWindow) {
      setLessonOrigin({ x: 0, y: 0 });
      return;
    }
    let measured = false;
    grid.measureInWindow((x, y) => {
      measured = true;
      if (lessonMeasureFallback.current) {
        clearTimeout(lessonMeasureFallback.current);
      }
      setLessonOrigin({ x, y });
    });
    lessonMeasureFallback.current = setTimeout(() => {
      if (!measured) setLessonOrigin({ x: 0, y: 0 });
    }, 32);
  }, []);

  const closeArrangeLesson = useCallback(() => {
    setLessonOrigin(undefined);
  }, []);

  useEffect(() => () => {
    if (lessonMeasureFallback.current) {
      clearTimeout(lessonMeasureFallback.current);
    }
  }, []);

  const dismissArrangeHint = useCallback(async () => {
    if (!dismissReorderHint) return false;
    try {
      await dismissReorderHint();
      return true;
    } catch {
      await notify(
        'Couldn’t dismiss tip',
        'The arrangement tip will remain available.',
      );
      return false;
    }
  }, [dismissReorderHint]);

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="library-safe-area"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <Reanimated.ScrollView
        ref={scrollRef}
        testID="library-scroll"
        stickyHeaderIndices={[0]}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 48,
        }}
        onLayout={(event) => {
          viewportHeight.value = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_width, height) => {
          contentHeight.value = height;
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
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
          <>
            {shouldShowRoutineArrangeHint(
              items.length,
              reorderHintDismissed,
            ) ? (
              <RoutineArrangeHint
                theme={theme}
                onOpenLesson={openArrangeLesson}
                onDismiss={dismissArrangeHint}
              />
            ) : null}
            <RoutineReorderGrid
              items={items}
              layout={layout}
              theme={theme}
              scrollRef={scrollRef}
              scrollY={scrollY}
              viewportHeight={viewportHeight}
              contentHeight={contentHeight}
              enabled={!savingOrder && lessonOrigin === undefined}
              containerRef={gridRef}
              onWidthChange={handleGridWidth}
              onEdit={onEdit}
              onStart={onStart}
              onReorder={(orderedIds) => {
                void persistOrder(orderedIds);
              }}
              onMoveByAccessibility={(id, delta) => {
                void moveByAccessibility(id, delta);
              }}
            />
            {lessonOrigin && items[0] ? (
              <RoutineArrangeLesson
                item={items[0]}
                layout={layout}
                viewportOrigin={lessonOrigin}
                theme={theme}
                onFinish={closeArrangeLesson}
              />
            ) : null}
          </>
        )}
      </Reanimated.ScrollView>
    </SafeAreaView>
  );
}
