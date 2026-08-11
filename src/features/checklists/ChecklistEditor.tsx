import { Fragment, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Dimensions,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';

import { Icon } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useTheme } from '@/src/theme/useTheme';

import { createChecklist, updateChecklist } from './repository';
import type { Checklist } from './types';
import {
  animateEditorRows,
  useChecklistReorder,
  type ReorderItem,
} from './useChecklistReorder';
import {
  validateChecklistItemText,
  validateChecklistTitle,
} from './validation';

const HOLD_TO_REORDER_MS = 350;

type EditorItem = ReorderItem;

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
  const [title, setTitle] = useState(initialChecklist?.title ?? '');
  const [items, setItems] = useState<EditorItem[]>(() =>
    initialItems(initialChecklist),
  );
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [keyboardClearance, setKeyboardClearance] = useState(0);
  const {
    drag,
    dragPreviewStyle,
    gestureFor,
    moveItemByAction,
    onRowLayout,
    onScroll,
    onViewportLayout,
    setContentHeight,
  } = useChecklistReorder({ items, setItems, scrollRef });

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
    animateEditorRows();
    setItems((current) => current.filter((item) => item.localId !== localId));
    setItemErrors((current) => {
      const next = { ...current };
      delete next[localId];
      return next;
    });
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
          onLayout={onViewportLayout}
          onContentSizeChange={(_, height) => {
            setContentHeight(height);
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
