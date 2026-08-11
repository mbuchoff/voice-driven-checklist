import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/src/components/Icon';
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
        contentContainerStyle={{ padding: 20, paddingTop: 18, paddingBottom: 40 }}
      >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderTopLeftRadius: 11,
            borderTopRightRadius: 11,
            borderBottomRightRadius: 11,
            borderBottomLeftRadius: 4,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 6px 14px ${theme.shadow}`,
          }}
        >
          <Icon name="check" color={theme.onPrimary} size={19} strokeWidth={2.5} testID="brand-icon" />
        </View>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.8, flex: 1 }}>
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
          <Icon name="settings" color={theme.text} size={20} testID="settings-icon" />
        </Pressable>
      </View>

      <View style={{ paddingTop: 42, paddingBottom: 26 }}>
        <Text style={{ color: theme.accentDark, fontSize: 12, fontWeight: '800', letterSpacing: 1.56, marginBottom: 8 }}>
          READY WHEN YOU ARE
        </Text>
        <Text style={{ color: theme.text, fontSize: 40, lineHeight: 39, fontWeight: '700', letterSpacing: -2.2, marginBottom: 12 }}>
          Your routines,{`\n`}one step at a time.
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 16, lineHeight: 25 }}>
          Pick a checklist and Voice Checklist will keep you moving—hands-free when you need it.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, marginBottom: 16 }}>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700', letterSpacing: -0.2, flex: 1 }}>
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
          <Icon name="plus" color={theme.onPrimary} size={18} />
          <Text style={{ color: theme.onPrimary, fontWeight: '700', fontSize: 14 }}>New</Text>
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
        <View style={{ gap: 12 }}>
        {items.map((item, index) => {
          const isEmpty = item.itemCount === 0;
          const badgeColors = theme.mode === 'dark'
            ? ['#422d26', '#203740', '#243a31', '#243a31']
            : ['#f8dfd0', '#dcebf0', '#deebdf', '#ebe2f0'];
          const badgeTextColors = theme.mode === 'dark'
            ? ['#f0a58c', '#8ec3d6', '#99c5ac', '#99c5ac']
            : ['#9b4a2f', '#32677d', '#3e6c55', '#6b5682'];
          return (
            <View
              key={item.id}
              style={{
                padding: 15,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 20,
                gap: 14,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.surface,
                boxShadow: `0 3px 8px ${theme.shadow}`,
              }}
            >
              <View
                style={{
                  width: 54,
                  height: 58,
                  borderTopLeftRadius: 18,
                  borderTopRightRadius: 18,
                  borderBottomRightRadius: 18,
                  borderBottomLeftRadius: 6,
                  backgroundColor: badgeColors[index % badgeColors.length],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name="checkCircle"
                  color={badgeTextColors[index % badgeTextColors.length]}
                  size={25}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 17, letterSpacing: -0.4 }}>{item.title}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>
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
                  <Icon name="edit" color={theme.textMuted} size={19} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${item.title}`}
                  testID={`delete-${item.id}`}
                  onPress={() => confirmDelete(item.id, item.title)}
                  style={{ width: 34, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon
                    name="trash"
                    color={theme.textMuted}
                    size={17}
                    testID={`delete-icon-${item.id}`}
                  />
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
                  <Icon name="play" color={theme.onPrimary} size={19} />
                </Pressable>
              </View>
            </View>
          );
        })}
        </View>
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
