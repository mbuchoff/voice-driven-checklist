import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmAction } from '@/src/components/confirm';
import { useDatabase } from '@/src/db/DatabaseProvider';
import { useTheme } from '@/src/theme/useTheme';

import {
  deleteChecklist,
  listChecklists,
} from './repository';
import type { ChecklistSummary } from './types';

export type LibraryScreenProps = {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onStart: (id: string) => void;
  onSettings?: () => void;
  /**
   * Increment to force a re-fetch of the checklist list. The route file bumps
   * this on focus so the library reflects edits made on other screens.
   */
  refreshKey?: number;
};

function itemCountLabel(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
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
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="library-safe-area"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: 40, gap: 14 }}
      >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 6px 14px ${theme.shadow}`,
          }}
        >
          <Text style={{ color: theme.onPrimary, fontSize: 21, fontWeight: '800' }}>✓</Text>
        </View>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', flex: 1 }}>
          Voice Checklist
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={onSettings}
          style={{
            width: 44,
            height: 44,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.surface,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 22 }}>⚙</Text>
        </Pressable>
      </View>

      <View style={{ gap: 7, marginTop: 28, marginBottom: 20 }}>
        <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 }}>
          READY WHEN YOU ARE
        </Text>
        <Text style={{ color: theme.text, fontSize: 40, lineHeight: 37, fontWeight: '900' }}>
          Your routines,{`\n`}one step at a time.
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 17, lineHeight: 24, marginTop: 8 }}>
          Pick a checklist and Voice Checklist will keep you moving—hands-free when you need it.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 }}>
          My checklists · {items.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New checklist"
          onPress={onCreate}
          style={{
            minHeight: 44,
            paddingHorizontal: 17,
            backgroundColor: theme.primary,
            borderRadius: 15,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            boxShadow: `0 7px 16px ${theme.shadow}`,
          }}
        >
          <Text style={{ color: theme.onPrimary, fontSize: 20 }}>＋</Text>
          <Text style={{ color: theme.onPrimary, fontWeight: '800' }}>New</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View
          style={{
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 20,
            padding: 22,
          }}
        >
          <Text style={{ color: theme.text }}>No checklists yet. Create one to get started.</Text>
        </View>
      ) : (
        items.map((item, index) => {
          const isEmpty = item.itemCount === 0;
          const badgeColors = [theme.accentSoft, '#dfeef3', '#dfeee4'];
          const badgeTextColors = [theme.danger, '#2f728d', theme.success];
          return (
            <View
              key={item.id}
              style={{
                padding: 12,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 20,
                gap: 6,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.surface,
                boxShadow: `0 3px 8px ${theme.shadow}`,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: badgeColors[index % badgeColors.length],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: badgeTextColors[index % badgeTextColors.length], fontSize: 22 }}>✓</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{item.title}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 14 }}>
                  {itemCountLabel(item.itemCount)} · Updated recently
                </Text>
                {isEmpty ? (
                  <Text style={{ color: theme.danger, fontSize: 12 }}>
                    Add at least one item to start this checklist.
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.title}`}
                  testID={`edit-${item.id}`}
                  onPress={() => onEdit(item.id)}
                  style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: theme.textMuted, fontSize: 19 }}>✎</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.title}`}
                  testID={`delete-${item.id}`}
                  onPress={() => confirmDelete(item.id, item.title)}
                  style={{ width: 34, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: theme.textMuted, fontSize: 16 }}>⌫</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${item.title}`}
                  testID={`start-${item.id}`}
                  disabled={isEmpty}
                  onPress={() => onStart(item.id)}
                  style={{
                    width: 44,
                    height: 48,
                    backgroundColor: isEmpty ? theme.disabled : theme.primary,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: theme.onPrimary, fontSize: 21 }}>▷</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
      <View style={{ borderTopWidth: 1, borderTopColor: theme.border, marginTop: 18, paddingTop: 20 }}>
        <Text style={{ color: theme.textMuted, textAlign: 'center', fontSize: 13 }}>
          Checklists stay on this device.
        </Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}
