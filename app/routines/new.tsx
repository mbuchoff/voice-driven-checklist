import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useDatabase } from '@/src/db/DatabaseProvider';
import { RoutineEditor } from '@/src/features/routines/RoutineEditor';
import { newRoutineColorKey } from '@/src/features/routines/repository';
import type { RoutineColorKey } from '@/src/features/routines/routineColors';

export default function NewRoutineRoute() {
  const router = useRouter();
  const db = useDatabase();
  const [colorKey, setColorKey] = useState<RoutineColorKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void newRoutineColorKey(db).then((key) => {
      if (!cancelled) setColorKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  if (!colorKey) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <RoutineEditor
      mode={{ kind: 'new', colorKey }}
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
