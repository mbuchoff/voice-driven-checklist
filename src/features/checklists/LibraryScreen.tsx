import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Pressable,
  ScrollView as NativeScrollView,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';

import { Icon } from '@/src/components/Icon';
import { notify } from '@/src/components/confirm';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useDevicePreferences } from '@/src/features/settings/DevicePreferencesProvider';
import { useTheme } from '@/src/theme/useTheme';

import { moveItem } from './reorder';
import { listChecklists, reorderChecklists } from './repository';
import {
  RoutineArrangeHint,
  shouldShowRoutineArrangeHint,
} from './RoutineArrangeHint';
import { RoutineArrangeLesson } from './RoutineArrangeLesson';
import { getRoutineGridMetrics } from './routineGrid';
import { RoutineReorderGrid } from './RoutineReorderGrid';
import type { LibraryChecklist } from './types';
import { useRoutineSelectionFeedback } from './useRoutineSelectionFeedback';

// The scroll ref must expose a gesture-handler tag for a pending card hold to
// block scrolling until the approved drift allowance is exceeded.
const RoutineScrollView = Reanimated.createAnimatedComponent(GestureScrollView);

export type LibraryScreenProps = {
  /** Pauses decorative animation while this mounted route is hidden. */
  active?: boolean;
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
        onPressIn={selection.pressIn}
        onPressOut={selection.pressOut}
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
  active = true,
  onCreate,
  onEdit,
  onStart,
  onSettings,
  refreshKey,
}: LibraryScreenProps) {
  const db = useDatabase();
  const theme = useTheme();
  const {
    preferences: { routineReorderHintDismissed: reorderHintDismissed },
    dismissRoutineReorderHint: dismissReorderHint,
  } = useDevicePreferences();
  const [items, setItems] = useState<LibraryChecklist[]>([]);
  const [orderRevision, setOrderRevision] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadRequest = useRef(0);
  const [savingOrder, setSavingOrder] = useState(false);
  const [gridWidth, setGridWidth] = useState(() =>
    Math.max(1, Dimensions.get('window').width - 32),
  );
  const itemsRef = useRef(items);
  const persistedItems = useRef(items);
  const savingOrderRef = useRef(false);
  const gridRef = useRef<View>(null);
  const lessonMeasurement = useRef(0);
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
    const request = ++loadRequest.current;
    listChecklists(db).then((loaded) => {
      if (request !== loadRequest.current) return;
      persistedItems.current = loaded;
      setItems(loaded);
      setLoadFailed(false);
    }).catch(() => {
      if (request === loadRequest.current) setLoadFailed(true);
    });
  }, [db]);

  useEffect(() => {
    refresh();
    return () => { loadRequest.current += 1; };
  }, [refresh, refreshKey]);

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
      const byId = new Map(itemsRef.current.map((item) => [item.id, item]));
      const orderedItems = orderedIds
        .map((id) => byId.get(id))
        .filter((item): item is LibraryChecklist => item !== undefined);
      if (savingOrderRef.current || orderedItems.length !== itemsRef.current.length) {
        // Reconcile slots without undoing another move's pending optimistic order.
        setOrderRevision(revision => revision + 1);
        return false;
      }

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
      if (savingOrderRef.current) {
        AccessibilityInfo.announceForAccessibility('Still saving the routine order. Please try again.');
        return;
      }
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

  // This identity reaches the grid's gesture memo; unrelated renders must not
  // replace every Pan configuration while a contact may be in progress.
  const handleReorder = useCallback((orderedIds: string[]) => {
    void persistOrder(orderedIds);
  }, [persistOrder]);

  const openArrangeLesson = useCallback(() => {
    const request = ++lessonMeasurement.current;
    const grid = gridRef.current;
    if (!grid?.measure) return;
    // Both this root and the translucent lesson modal draw edge-to-edge.
    // measureInWindow subtracts Android's visible-window/status-bar inset.
    grid.measure((_x, _y, width, height, x, y) => {
      if (request !== lessonMeasurement.current || width <= 0 || height <= 0
        || !Number.isFinite(x) || !Number.isFinite(y)) return;
      setLessonOrigin({ x, y });
    });
  }, []);

  const closeArrangeLesson = useCallback(() => {
    // Invalidate queued measurements synchronously, before navigation starts.
    lessonMeasurement.current += 1;
    setLessonOrigin(undefined);
  }, []);

  useEffect(() => () => {
    lessonMeasurement.current += 1;
  }, []);

  const dismissArrangeHint = useCallback(async () => {
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
      <View
        testID="library-header"
        style={{
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
          onPress={() => { closeArrangeLesson(); onCreate(); }}
          testID="new-checklist"
        />
        <HeaderControl
          accessibilityLabel="Settings"
          icon="settings"
          onPress={() => { closeArrangeLesson(); onSettings?.(); }}
          testID="open-settings"
        />
      </View>
      <RoutineScrollView
        ref={scrollRef}
        testID="library-scroll"
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
        {loadFailed ? (
          <View testID="library-load-error" style={{ padding: 22, gap: 12 }}>
            <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
              Couldn’t load your routines
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 20 }}>
              Please try again. If this continues, restart Voice Checklist.
            </Text>
            <Pressable
              testID="library-load-retry"
              accessibilityRole="button"
              onPress={refresh}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '700' }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {!loadFailed && items.length === 0 ? (
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
        ) : null}
        {!loadFailed && items.length > 0 ? (
          <>
            {shouldShowRoutineArrangeHint(
              items.length,
              reorderHintDismissed,
            ) ? (
              <RoutineArrangeHint
                active={active}
                theme={theme}
                onOpenLesson={openArrangeLesson}
                onDismiss={dismissArrangeHint}
              />
            ) : null}
            <RoutineReorderGrid
              items={items}
              orderRevision={orderRevision}
              layout={layout}
              theme={theme}
              scrollRef={scrollRef}
              scrollY={scrollY}
              viewportHeight={viewportHeight}
              contentHeight={contentHeight}
              enabled={!savingOrder && lessonOrigin === undefined}
              containerRef={gridRef}
              onWidthChange={handleGridWidth}
              onEdit={(id) => { closeArrangeLesson(); onEdit(id); }}
              onStart={(id) => { closeArrangeLesson(); onStart(id); }}
              onReorder={handleReorder}
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
        ) : null}
      </RoutineScrollView>
    </SafeAreaView>
  );
}
