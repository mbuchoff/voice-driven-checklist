import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { confirmAction } from '@/src/components/confirm';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useTheme } from '@/src/theme/useTheme';

import { deleteChecklist, listChecklists } from './repository';
import type { ChecklistSummary } from './types';

export type LibraryScreenProps = {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onStart: (id: string) => void;
  /**
   * Increment to force a re-fetch of the checklist list. The route file bumps
   * this on focus so the library reflects edits made on other screens.
   */
  refreshKey?: number;
};

function itemCountLabel(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

export function LibraryScreen({ onCreate, onEdit, onStart, refreshKey }: LibraryScreenProps) {
  const db = useDatabase();
  const theme = useTheme();
  const [items, setItems] = useState<ChecklistSummary[]>([]);

  const refresh = useCallback(() => {
    listChecklists(db).then(setItems);
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const confirmDelete = async (id: string, title: string) => {
    const ok = await confirmAction({
      title: 'Delete checklist?',
      message: `“${title}” will be permanently removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await deleteChecklist(db, id);
    refresh();
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onCreate}
        style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: theme.primary, borderRadius: 8 }}
      >
        <Text style={{ color: theme.onPrimary, fontWeight: '600', textAlign: 'center' }}>New checklist</Text>
      </Pressable>

      {items.length === 0 ? (
        <Text style={{ color: theme.text }}>No checklists yet. Create one to get started.</Text>
      ) : (
        items.map((item) => {
          const isEmpty = item.itemCount === 0;
          return (
            <View
              key={item.id}
              style={{ padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 8, gap: 6 }}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>{item.title}</Text>
              <Text style={{ color: theme.textMuted }}>{itemCountLabel(item.itemCount)}</Text>
              {isEmpty && (
                <Text style={{ color: theme.danger }}>
                  Add at least one item to start this checklist.
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable
                  accessibilityRole="button"
                  testID={`start-${item.id}`}
                  disabled={isEmpty}
                  onPress={() => onStart(item.id)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    backgroundColor: isEmpty ? theme.disabled : theme.primary,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: theme.onPrimary }}>Start</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID={`edit-${item.id}`}
                  onPress={() => onEdit(item.id)}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 6 }}
                >
                  <Text style={{ color: theme.text }}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  testID={`delete-${item.id}`}
                  onPress={() => confirmDelete(item.id, item.title)}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 6 }}
                >
                  <Text style={{ color: theme.danger }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
