import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useDatabase } from '@/src/db/DatabaseProvider';
import { RoutineEditor } from '@/src/features/routines/RoutineEditor';
import { getRoutine } from '@/src/features/routines/repository';
import { useRoutineUndo } from '@/src/features/routines/routineUndo';
import type { Routine } from '@/src/features/routines/types';

export default function EditRoutineRoute() {
  const router = useRouter();
  const db = useDatabase();
  const routineUndo = useRoutineUndo();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ready'; routine: Routine }>({
    kind: 'loading',
  });

  useEffect(() => {
    if (!id) return;
    getRoutine(db, id).then((routine) => {
      if (!routine) {
        router.replace('/');
        return;
      }
      setState({ kind: 'ready', routine });
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
    <RoutineEditor
      mode={{
        kind: 'edit',
        routine: state.routine,
        onDeleted: (deleted) => {
          routineUndo.offer(deleted);
          router.dismissTo('/');
        },
        onRun: (routine) => router.replace({ pathname: '/run/[id]', params: { id: routine.id } }),
      }}
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
