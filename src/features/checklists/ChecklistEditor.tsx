import { Fragment, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { v4 as uuidv4 } from 'uuid';

import { useDatabase } from '@/src/db/DatabaseProvider';
import { useTheme } from '@/src/theme/useTheme';

import { createChecklist, updateChecklist } from './repository';
import { moveItem } from './reorder';
import type { Checklist } from './types';
import {
  validateChecklistItemText,
  validateChecklistTitle,
} from './validation';

type EditorItem = { localId: string; text: string };
type RowLayout = { y: number; height: number };
type DragState = { localId: string; text: string; to: number; top: number; height: number };
type DragContext = DragState & {
  from: number;
  startCenterY: number;
  startPageY: number;
  startScrollY: number;
};

export type ChecklistEditorProps = {
  initialChecklist?: Checklist;
  onSaved: (saved: Checklist) => void;
  onCancel: () => void;
};

function makeBlankItem(): EditorItem {
  return { localId: uuidv4(), text: '' };
}

function initialItems(checklist?: Checklist): EditorItem[] {
  if (checklist && checklist.items.length > 0) {
    return checklist.items.map((item) => ({ localId: uuidv4(), text: item.text }));
  }
  return [makeBlankItem()];
}

function DragHandleIcon({ color }: { color: string }) {
  return (
    <>
      <View style={{ width: 16, height: 2, backgroundColor: color }} />
      <View style={{ width: 16, height: 2, backgroundColor: color }} />
      <View style={{ width: 16, height: 2, backgroundColor: color }} />
    </>
  );
}

function dragStateFrom(context: DragContext): DragState {
  return {
    localId: context.localId,
    text: context.text,
    to: context.to,
    top: context.top,
    height: context.height,
  };
}

export function ChecklistEditor({ initialChecklist, onSaved, onCancel }: ChecklistEditorProps) {
  const db = useDatabase();
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const rowLayouts = useRef<RowLayout[]>([]);
  const dragRef = useRef<DragContext | null>(null);
  const scrollY = useRef(0);
  const viewportTop = useRef(0);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const [title, setTitle] = useState(initialChecklist?.title ?? '');
  const [items, setItems] = useState<EditorItem[]>(() => initialItems(initialChecklist));
  const [titleError, setTitleError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragHandleBoxStyle: ViewStyle = {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  };
  const itemTextStyle: TextStyle = {
    color: theme.text,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 6,
    padding: 6,
    flex: 1,
  };

  const updateItemText = (localId: string, text: string) => {
    setItems((prev) => prev.map((item) => (item.localId === localId ? { ...item, text } : item)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, makeBlankItem()]);
  };

  const deleteItem = (localId: string) => {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  };

  const onRowLayout = (index: number, event: LayoutChangeEvent) => {
    if (dragRef.current) return;

    const { y, height } = event.nativeEvent.layout;
    rowLayouts.current[index] = { y, height };
  };

  const dropIndexFor = (localId: string, contentY: number) => {
    let index = 0;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
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

    const threshold = 48;
    const step = 28;
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

  const updateDrag = (pageY: number) => {
    const current = dragRef.current;
    if (!current) return;

    const contentY =
      current.startCenterY + (pageY - current.startPageY) + (scrollY.current - current.startScrollY);
    const to = dropIndexFor(current.localId, contentY);
    current.to = to;
    current.top = contentY - current.height / 2;
    setDrag(dragStateFrom(current));
    autoscrollNearEdge(pageY);
  };

  const startDrag = (item: EditorItem, index: number, event: GestureResponderEvent) => {
    const layout = rowLayouts.current[index];
    if (!layout) return;

    Keyboard.dismiss();
    const current: DragContext = {
      localId: item.localId,
      text: item.text,
      from: index,
      to: index,
      top: layout.y,
      height: layout.height,
      startCenterY: layout.y + layout.height / 2,
      startPageY: event.nativeEvent.pageY,
      startScrollY: scrollY.current,
    };
    dragRef.current = current;
    setDrag(dragStateFrom(current));
  };

  const finishDrag = () => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    setItems((prev) => moveItem(prev, current.from, current.to));
  };

  const moveItemByAction = (index: number, delta: -1 | 1) => {
    setItems((prev) => moveItem(prev, index, index + delta));
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  };

  const renderDropTarget = (index: number) =>
    drag?.to === index ? (
      <View
        key={`drop-target-${index}`}
        testID={`item-drop-target-${index}`}
        style={{
          height: 8,
          borderRadius: 4,
          borderWidth: 1,
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
      if (!result.ok) {
        nextItemErrors[item.localId] = result.error;
      } else {
        validItems.push({ text: result.value });
      }
    }
    setTitleError(titleResult.ok ? null : titleResult.error);
    setItemErrors(nextItemErrors);

    if (!titleResult.ok || Object.keys(nextItemErrors).length > 0) return;

    const input = { title: titleResult.value, items: validItems };
    const saved = initialChecklist
      ? await updateChecklist(db, initialChecklist.id, input)
      : await createChecklist(db, input);
    onSaved(saved);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      testID="checklist-editor-scroll"
      onLayout={(event) => {
        const { y, height } = event.nativeEvent.layout;
        viewportTop.current = y;
        viewportHeight.current = height;
      }}
      onContentSizeChange={(_, height) => {
        contentHeight.current = height;
      }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <View>
        <Text style={{ color: theme.text, fontWeight: '600', marginBottom: 4 }}>Title</Text>
        <TextInput
          testID="title-input"
          value={title}
          onChangeText={setTitle}
          placeholder="Checklist title"
          placeholderTextColor={theme.textMuted}
          style={{
            color: theme.text,
            borderWidth: 1,
            borderColor: titleError ? theme.danger : theme.inputBorder,
            borderRadius: 6,
            padding: 8,
          }}
        />
        {titleError && (
          <Text testID="title-error" style={{ color: theme.danger, marginTop: 4 }}>
            {titleError}
          </Text>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.text, fontWeight: '600' }}>Items</Text>
        {(() => {
          let dropIndex = 0;
          return items.map((item, index) => {
            const error = itemErrors[item.localId];
            const isActive = drag?.localId === item.localId;
            const dropTarget = isActive ? null : renderDropTarget(dropIndex);
            if (!isActive) dropIndex += 1;
            return (
              <Fragment key={item.localId}>
                {dropTarget}
                <View
                  testID={`item-row-${index}`}
                  onLayout={(event) => onRowLayout(index, event)}
                  style={{
                    borderWidth: 1,
                    borderColor: error ? theme.danger : theme.border,
                    borderRadius: 6,
                    padding: 8,
                    gap: 6,
                    backgroundColor: theme.background,
                    opacity: isActive ? 0 : 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View
                      accessibilityRole="adjustable"
                      accessibilityLabel={`Drag item ${index + 1}`}
                      accessibilityActions={[
                        { name: 'decrement', label: 'Move up' },
                        { name: 'increment', label: 'Move down' },
                      ]}
                      onAccessibilityAction={(event) => {
                        if (event.nativeEvent.actionName === 'decrement') moveItemByAction(index, -1);
                        if (event.nativeEvent.actionName === 'increment') moveItemByAction(index, 1);
                      }}
                      testID={`item-drag-handle-${index}`}
                      onStartShouldSetResponder={() => true}
                      onResponderGrant={(event) => startDrag(item, index, event)}
                      onResponderMove={(event) => updateDrag(event.nativeEvent.pageY)}
                      onResponderRelease={finishDrag}
                      onResponderTerminate={finishDrag}
                      style={dragHandleBoxStyle}
                    >
                      <DragHandleIcon color={theme.textMuted} />
                    </View>
                    <TextInput
                      testID={`item-text-${index}`}
                      value={item.text}
                      onChangeText={(text) => updateItemText(item.localId, text)}
                      placeholder={`Item ${index + 1}`}
                      placeholderTextColor={theme.textMuted}
                      style={itemTextStyle}
                    />
                    <Pressable
                      accessibilityRole="button"
                      testID={`item-delete-${index}`}
                      onPress={() => deleteItem(item.localId)}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 6,
                      }}
                    >
                      <Text style={{ color: theme.danger }}>Delete</Text>
                    </Pressable>
                  </View>
                  {error && (
                    <Text testID={`item-error-${index}`} style={{ color: theme.danger }}>
                      {error}
                    </Text>
                  )}
                </View>
              </Fragment>
            );
          });
        })()}
        {drag && renderDropTarget(items.length - 1)}
        {drag && (
          <View
            testID="item-drag-preview"
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: drag.top,
              left: 0,
              right: 0,
              minHeight: drag.height,
              borderWidth: 2,
              borderColor: theme.primary,
              borderRadius: 6,
              padding: 8,
              backgroundColor: theme.background,
              zIndex: 10,
              elevation: 6,
              boxShadow: '0 3px 8px rgba(0, 0, 0, 0.18)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View
              style={dragHandleBoxStyle}
            >
              <DragHandleIcon color={theme.textMuted} />
            </View>
            <Text
              testID="item-drag-preview-text"
              style={itemTextStyle}
            >
              {drag.text}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          testID="add-item"
          onPress={addItem}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: theme.border,
            borderStyle: 'dashed',
            borderRadius: 6,
            alignSelf: 'flex-start',
          }}
        >
          <Text style={{ color: theme.text }}>Add item</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          testID="save"
          onPress={handleSave}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 18,
            backgroundColor: theme.primary,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: theme.onPrimary, fontWeight: '600' }}>Save</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="cancel"
          onPress={onCancel}
          style={{ paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1, borderColor: theme.border, borderRadius: 6 }}
        >
          <Text style={{ color: theme.text }}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
