import { useRouter } from 'expo-router';

import { RoutineEditor } from '@/src/features/routines/RoutineEditor';

export default function NewRoutineRoute() {
  const router = useRouter();

  return (
    <RoutineEditor
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
