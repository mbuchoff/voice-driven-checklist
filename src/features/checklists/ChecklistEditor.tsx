import { Fragment, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Pressable,
  Text,
  TextInput,
  Vibration,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';

import { Icon } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useTheme } from '@/src/theme/useTheme';

import { createChecklist, updateChecklist } from './repository';
import { moveItem } from './reorder';
import type { Checklist } from './types';
import {
  validateChecklistItemText,
  validateChecklistTitle,
} from './validation';

const HOLD_TO_REORDER_MS = 350;

type EditorItem = { localId: string; text: string };
type RowLayout = { y: number; height: number };
type DragState = {
  localId: string;
  text: string;
  from: number;
  to: number;
  top: number;
  height: number;
};
type DragContext = DragState & {
  startCenterY: number;
  startPageY: number;
  startScrollY: number;
};

export type ChecklistEditorProps = {
  initialChecklist?: Checklist;
  onSaved: (saved: Checklist) => void;
  onCancel: () => void;
};

export function focusEditorInput(input: { focus: () => void } | null) {
  input?.focus();
}

function makeBlankItem(): EditorItem {
  return { localId: uuidv4(), text: '' };
}

function initialItems(checklist?: Checklist): EditorItem[] {
  if (checklist && checklist.items.length > 0) {
    return checklist.items.map((item) => ({
      localId: uuidv4(),
      text: item.text,
    }));
  }
  return [makeBlankItem()];
}

function dragStateFrom(context: DragContext): DragState {
  return {
    localId: context.localId,
    text: context.text,
    from: context.from,
    to: context.to,
    top: context.top,
    height: context.height,
  };
}

function animateRowsAside() {
  LayoutAnimation.configureNext({
    duration: 160,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity' },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity' },
  });
}

export function ChecklistEditor({
  initialChecklist,
  onSaved,
  onCancel,
}: ChecklistEditorProps) {
  const database = useDatabase();
  const theme = useTheme();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const itemInputRefs = useRef<
    Record<string, ComponentRef<typeof TextInput> | null>
  >({});
  const rowLayouts = useRef<RowLayout[]>([]);
  const dragRef = useRef<DragContext | null>(null);
  const scrollY = useRef(0);
  const viewportTop = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const dragBaseTop = useRef(0);
  const dragOffset = useSharedValue(0);
  const [title, setTitle] = useState(initialChecklist?.title ?? '');
  const [items, setItems] = useState<EditorItem[]>(() =>
    initialItems(initialChecklist),
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const [keyboardClearance, setKeyboardClearance] = useState(0);
  const dragPreviewStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragOffset.value }],
  }));

  const scrollFocusedItemIntoView = () => {
    if (!focusItemId || keyboardClearance <= 0) return;
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      const clearance = Math.max(
        0,
        Dimensions.get('screen').height - event.endCoordinates.screenY,
      );
      setKeyboardClearance(clearance);
      if (focusItemId) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        });
      }
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardClearance(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [focusItemId]);

  useEffect(() => {
    if (!focusItemId) return;
    focusEditorInput(itemInputRefs.current[focusItemId]);
  }, [focusItemId]);

  const updateItemText = (localId: string, text: string) => {
    setItems((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, text } : item,
      ),
    );
  };

  const addItem = () => {
    const item = makeBlankItem();
    setFocusItemId(item.localId);
    setItems((current) => [...current, item]);
  };

  const deleteItem = (localId: string) => {
    animateRowsAside();
    setItems((current) => current.filter((item) => item.localId !== localId));
    setItemErrors((current) => {
      const next = { ...current };
      delete next[localId];
      return next;
    });
  };

  const onRowLayout = (index: number, event: LayoutChangeEvent) => {
    if (dragRef.current) return;
    const { y, height } = event.nativeEvent.layout;
    rowLayouts.current[index] = { y, height };
  };

  const dropIndexFor = (localId: string, contentY: number) => {
    let index = 0;
    const currentItems = itemsRef.current;
    for (let itemIndex = 0; itemIndex < currentItems.length; itemIndex += 1) {
      const item = currentItems[itemIndex];
      if (item.localId === localId) continue;
      const layout = rowLayouts.current[itemIndex];
      if (layout && contentY < layout.y + layout.height / 2) return index;
      index += 1;
    }
    return index;
  };

  const autoscrollNearEdge = (pageY: number) => {
    const maxY = Math.max(0, contentHeight.current - viewportHeight.current);
    if (!viewportHeight.current || !maxY) return;

    const threshold = 56;
    const step = 32;
    const viewportY = pageY - viewportTop.current;
    let nextY = scrollY.current;
    if (viewportY < threshold) {
      nextY = Math.max(0, scrollY.current - step);
    } else if (viewportHeight.current - viewportY < threshold) {
      nextY = Math.min(maxY, scrollY.current + step);
    }
    if (nextY === scrollY.current) return;

    scrollY.current = nextY;
    scrollRef.current?.scrollTo({ y: nextY, animated: false });
  };

  const startDrag = (localId: string, pageY: number) => {
    const currentItems = itemsRef.current;
    const index = currentItems.findIndex((item) => item.localId === localId);
    if (index < 0) return;
    const item = currentItems[index];
    const layout = rowLayouts.current[index];
    if (!layout || dragRef.current) return;

    Keyboard.dismiss();
    Vibration.vibrate(15);
    const current: DragContext = {
      localId: item.localId,
      text: item.text,
      from: index,
      to: index,
      top: layout.y,
      height: layout.height,
      startCenterY: layout.y + layout.height / 2,
      startPageY: pageY,
      startScrollY: scrollY.current,
    };
    dragBaseTop.current = current.top;
    dragOffset.value = 0;
    animateRowsAside();
    dragRef.current = current;
    setDrag(dragStateFrom(current));
  };

  const updateDrag = (pageY: number) => {
    const current = dragRef.current;
    if (!current) return;

    autoscrollNearEdge(pageY);
    const contentY =
      current.startCenterY +
      (pageY - current.startPageY) +
      (scrollY.current - current.startScrollY);
    const to = dropIndexFor(current.localId, contentY);
    const targetChanged = to !== current.to;
    current.to = to;
    current.top = contentY - current.height / 2;
    if (!targetChanged) {
      dragOffset.value = current.top - dragBaseTop.current;
      return;
    }
    dragBaseTop.current = current.top;
    dragOffset.value = 0;
    animateRowsAside();
    setDrag(dragStateFrom(current));
  };

  const finishDrag = () => {
    const current = dragRef.current;
    dragRef.current = null;
    if (!current) return;
    animateRowsAside();
    setDrag(null);
    setItems((previous) => moveItem(previous, current.from, current.to));
  };

  const cancelDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    animateRowsAside();
    setDrag(null);
  };

  const moveItemByAction = (index: number, delta: -1 | 1) => {
    animateRowsAside();
    setItems((previous) => moveItem(previous, index, index + delta));
  };

  const gestureFor = (item: EditorItem) =>
    Gesture.Pan()
      .withTestId(`item-hold-gesture-${item.localId}`)
      .activateAfterLongPress(HOLD_TO_REORDER_MS)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .blocksExternalGesture(scrollRef as never)
      .runOnJS(true)
      .onStart((event) => startDrag(item.localId, event.absoluteY))
      .onUpdate((event) => updateDrag(event.absoluteY))
      .onEnd(finishDrag)
      .onFinalize((_event, success) => {
        if (!success) cancelDrag();
      });

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  };

  const renderDropTarget = (index: number) =>
    drag?.to === index ? (
      <View
        key={`drop-target-${index}`}
        testID={`item-drop-target-${index}`}
        style={{
          height: drag.height,
          borderRadius: 18,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: theme.primary,
          backgroundColor: theme.surfaceAlt,
        }}
      />
    ) : null;

  const handleSave = async () => {
    const titleResult = validateChecklistTitle(title);
    const nextItemErrors: Record<string, string> = {};
    const validItems: { text: string }[] = [];
    for (const item of items) {
      const result = validateChecklistItemText(item.text);
      if (!result.ok) nextItemErrors[item.localId] = result.error;
      else validItems.push({ text: result.value });
    }
    setTitleError(titleResult.ok ? null : titleResult.error);
    setItemErrors(nextItemErrors);
    if (!titleResult.ok || Object.keys(nextItemErrors).length > 0) return;

    const input = { title: titleResult.value, items: validItems };
    const saved = initialChecklist
      ? await updateChecklist(database, initialChecklist.id, input)
      : await createChecklist(database, input);
    onSaved(saved);
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="editor-safe-area"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScreenBackground variant="editor" />
      <View
        testID="editor-actions"
        style={{
          minHeight: 66,
          paddingHorizontal: 20,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.background,
          flexDirection: 'row',
          alignItems: 'center',
          zIndex: 20,
          elevation: 8,
        }}
      >
        <Pressable
          accessibilityRole="button"
          testID="cancel"
          onPress={onCancel}
          style={{ minWidth: 72, minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
        </Pressable>
        <Text
          style={{
            color: theme.textMuted,
            fontSize: 12,
            letterSpacing: 1.5,
            fontWeight: '700',
            textAlign: 'center',
            flex: 1,
          }}
        >
          {initialChecklist ? 'EDIT CHECKLIST' : 'NEW CHECKLIST'}
        </Text>
        <Pressable
          accessibilityRole="button"
          testID="save"
          onPress={() => void handleSave()}
          style={{
            minWidth: 72,
            minHeight: 44,
            backgroundColor: theme.primary,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: theme.onPrimary, fontWeight: '700', fontSize: 13 }}>Save</Text>
        </Pressable>
      </View>

      <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 48 + keyboardClearance,
            gap: 20,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEnabled={!drag}
          testID="checklist-editor-scroll"
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            viewportTop.current = y;
            viewportHeight.current = height;
          }}
          onContentSizeChange={(_, height) => {
            contentHeight.current = height;
            scrollFocusedItemIntoView();
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View style={{ gap: 3 }}>
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '800', letterSpacing: 1.5 }}>
              BUILD YOUR FLOW
            </Text>
            <Text style={{ color: theme.text, fontSize: 34, lineHeight: 36, fontWeight: '700', letterSpacing: -1.7 }}>
              Shape the routine
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 15, lineHeight: 20 }}>
              Short works best, while longer steps should stay readable when you need them.
            </Text>
          </View>

          <View style={{ gap: 7 }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, flex: 1 }}>Checklist name</Text>
              <Text style={{ color: theme.textFaint, fontSize: 12, fontWeight: '500' }}>Required</Text>
            </View>
            <TextInput
              testID="title-input"
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Leaving home"
              placeholderTextColor={theme.textMuted}
              style={{
                color: theme.text,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: titleError ? theme.danger : theme.inputBorder,
                borderRadius: 17,
                paddingHorizontal: 16,
                paddingVertical: 14,
                minHeight: 58,
                fontSize: 18,
                fontWeight: '600',
              }}
            />
            {titleError ? (
              <Text testID="title-error" style={{ color: theme.danger }}>
                {titleError}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13, flex: 1 }}>
                Steps · {items.length}
              </Text>
              <Text style={{ color: theme.textFaint, fontSize: 12, fontWeight: '500' }}>
                Edit or reorder anytime
              </Text>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              Tap a step to edit. Press and hold a row to reorder.
            </Text>

            {(() => {
              let dropIndex = 0;
              return items.map((item, index) => {
                const error = itemErrors[item.localId];
                const isActive = drag?.localId === item.localId;
                const isEditing = focusItemId === item.localId;
                const editGesture = Gesture.Tap()
                  .withTestId(`item-edit-gesture-${item.localId}`)
                  .maxDuration(HOLD_TO_REORDER_MS - 1)
                  .runOnJS(true)
                  .onEnd((_event, success) => {
                    if (success) setFocusItemId(item.localId);
                  });
                const rowInteraction = Gesture.Exclusive(
                  gestureFor(item),
                  editGesture,
                );
                const dropTarget = isActive
                  ? null
                  : renderDropTarget(dropIndex);
                if (!isActive) dropIndex += 1;

                return (
                  <Fragment key={item.localId}>
                    {dropTarget}
                    <GestureDetector gesture={rowInteraction}>
                      <View
                        testID={`item-row-${index}`}
                        nativeID={item.localId}
                        accessibilityLabel={`Hold row ${index + 1} to reorder`}
                        onLayout={(event) => onRowLayout(index, event)}
                        style={{
                          position: isActive ? 'absolute' : 'relative',
                          opacity: isActive ? 0 : 1,
                          minHeight: 64,
                          borderWidth: 1,
                          borderColor: error ? theme.danger : theme.border,
                          borderRadius: 18,
                          padding: 8,
                          backgroundColor: theme.surface,
                          boxShadow: `0 2px 6px ${theme.shadow}`,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <View
                          accessibilityRole="adjustable"
                          accessibilityLabel={`Reorder step ${index + 1}`}
                          accessibilityActions={[
                            { name: 'decrement', label: 'Move up' },
                            { name: 'increment', label: 'Move down' },
                          ]}
                          onAccessibilityAction={(event) => {
                            if (event.nativeEvent.actionName === 'decrement') {
                              moveItemByAction(index, -1);
                            }
                            if (event.nativeEvent.actionName === 'increment') {
                              moveItemByAction(index, 1);
                            }
                          }}
                          style={{
                            width: 30,
                            height: 30,
                            borderTopLeftRadius: 10,
                            borderTopRightRadius: 10,
                            borderBottomRightRadius: 10,
                            borderBottomLeftRadius: 4,
                            backgroundColor: theme.surfaceAlt,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 12 }}>{index + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View
                            testID={`item-edit-${index}`}
                            pointerEvents={isEditing ? 'auto' : 'none'}
                          >
                            <TextInput
                              ref={(input) => {
                                itemInputRefs.current[item.localId] = input;
                              }}
                              testID={`item-text-${index}`}
                              value={item.text}
                              multiline
                              scrollEnabled={false}
                              editable={isEditing}
                              autoFocus={isEditing}
                              onBlur={() => {
                                setFocusItemId((current) =>
                                  current === item.localId ? null : current,
                                );
                              }}
                              onChangeText={(text) => updateItemText(item.localId, text)}
                              placeholder={`Step ${index + 1}`}
                              placeholderTextColor={theme.textMuted}
                              textAlignVertical="center"
                              style={{
                                color: theme.text,
                                minHeight: 44,
                                paddingHorizontal: 6,
                                paddingVertical: 8,
                                fontSize: 16,
                                lineHeight: 21,
                              }}
                            />
                          </View>
                          {error ? (
                            <Text testID={`item-error-${index}`} style={{ color: theme.danger, paddingHorizontal: 6 }}>
                              {error}
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete step ${index + 1}`}
                          testID={`item-delete-${index}`}
                          onPress={() => deleteItem(item.localId)}
                          hitSlop={8}
                          style={{ width: 34, height: 44, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Icon
                            name="trash"
                            color={theme.textFaint}
                            size={16}
                            testID={`delete-step-icon-${index}`}
                          />
                        </Pressable>
                      </View>
                    </GestureDetector>
                  </Fragment>
                );
              });
            })()}

            {renderDropTarget(items.length - 1)}

            {drag ? (
              <Animated.View
                testID="item-drag-preview"
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: drag.top,
                    left: 0,
                    right: 0,
                    minHeight: drag.height,
                    borderWidth: 2,
                    borderColor: theme.primary,
                    borderRadius: 18,
                    padding: 10,
                    backgroundColor: theme.surface,
                    zIndex: 30,
                    elevation: 12,
                    boxShadow: `0 8px 18px ${theme.shadow}`,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  },
                  dragPreviewStyle,
                ]}
              >
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    borderBottomRightRadius: 10,
                    borderBottomLeftRadius: 4,
                    backgroundColor: theme.surfaceAlt,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: theme.primaryDark, fontWeight: '800', fontSize: 12 }}>{drag.from + 1}</Text>
                </View>
                <Text testID="item-drag-preview-text" style={{ color: theme.text, fontSize: 16, flex: 1 }}>
                  {drag.text}
                </Text>
              </Animated.View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              testID="add-item"
              onPress={addItem}
              style={{
                minHeight: 56,
                borderWidth: 1,
                borderColor: theme.textFaint,
                borderStyle: 'dashed',
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                marginTop: 10,
                backgroundColor: theme.surfaceSoft,
              }}
            >
              <Icon name="plus" color={theme.primary} size={18} testID="add-step-icon" />
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 14 }}>Add another step</Text>
            </Pressable>
          </View>
      </ScrollView>
    </SafeAreaView>
  );
}
