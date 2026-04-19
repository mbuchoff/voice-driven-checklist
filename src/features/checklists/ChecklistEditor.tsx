import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

import { useDatabase } from '@/src/db/DatabaseProvider';

import { createChecklist, updateChecklist } from './repository';
import type { Checklist } from './types';
import {
  validateChecklistItemText,
  validateChecklistTitle,
} from './validation';

type EditorItem = { localId: string; text: string };

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

export function ChecklistEditor({ initialChecklist, onSaved, onCancel }: ChecklistEditorProps) {
  const db = useDatabase();
  const [title, setTitle] = useState(initialChecklist?.title ?? '');
  const [items, setItems] = useState<EditorItem[]>(() => initialItems(initialChecklist));
  const [titleError, setTitleError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const updateItemText = (localId: string, text: string) => {
    setItems((prev) => prev.map((item) => (item.localId === localId ? { ...item, text } : item)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, makeBlankItem()]);
  };

  const deleteItem = (localId: string) => {
    setItems((prev) => prev.filter((item) => item.localId !== localId));
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    setItems((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View>
        <Text style={{ fontWeight: '600', marginBottom: 4 }}>Title</Text>
        <TextInput
          testID="title-input"
          value={title}
          onChangeText={setTitle}
          placeholder="Checklist title"
          style={{
            borderWidth: 1,
            borderColor: titleError ? '#a0431f' : '#ccc',
            borderRadius: 6,
            padding: 8,
          }}
        />
        {titleError && (
          <Text testID="title-error" style={{ color: '#a0431f', marginTop: 4 }}>
            {titleError}
          </Text>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: '600' }}>Items</Text>
        {items.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === items.length - 1;
          const error = itemErrors[item.localId];
          return (
            <View
              key={item.localId}
              style={{
                borderWidth: 1,
                borderColor: error ? '#a0431f' : '#ddd',
                borderRadius: 6,
                padding: 8,
                gap: 6,
              }}
            >
              <TextInput
                testID={`item-text-${index}`}
                value={item.text}
                onChangeText={(text) => updateItemText(item.localId, text)}
                placeholder={`Item ${index + 1}`}
                style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 6 }}
              />
              {error && (
                <Text testID={`item-error-${index}`} style={{ color: '#a0431f' }}>
                  {error}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isFirst }}
                  testID={`item-move-up-${index}`}
                  disabled={isFirst}
                  onPress={() => moveItem(index, -1)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderRadius: 6,
                    opacity: isFirst ? 0.4 : 1,
                  }}
                >
                  <Text>Move up</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isLast }}
                  testID={`item-move-down-${index}`}
                  disabled={isLast}
                  onPress={() => moveItem(index, 1)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderRadius: 6,
                    opacity: isLast ? 0.4 : 1,
                  }}
                >
                  <Text>Move down</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID={`item-delete-${index}`}
                  onPress={() => deleteItem(item.localId)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderWidth: 1,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: '#a0431f' }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          testID="add-item"
          onPress={addItem}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderRadius: 6,
            alignSelf: 'flex-start',
          }}
        >
          <Text>Add item</Text>
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
            backgroundColor: '#0a84ff',
            borderRadius: 6,
          }}
        >
          <Text style={{ color: 'white', fontWeight: '600' }}>Save</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          testID="cancel"
          onPress={onCancel}
          style={{ paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1, borderRadius: 6 }}
        >
          <Text>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
