import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useDatabase } from '@/src/db/DatabaseProvider';
import { ChecklistEditor } from '@/src/features/checklists/ChecklistEditor';
import { getChecklist } from '@/src/features/checklists/repository';
import type { Checklist } from '@/src/features/checklists/types';

export default function EditChecklistRoute() {
  const router = useRouter();
  const db = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ready'; checklist: Checklist }>({
    kind: 'loading',
  });

  useEffect(() => {
    if (!id) return;
    getChecklist(db, id).then((checklist) => {
      if (!checklist) {
        router.replace('/');
        return;
      }
      setState({ kind: 'ready', checklist });
    });
  }, [db, id, router]);

  if (state.kind === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ChecklistEditor
      initialChecklist={state.checklist}
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
