import { useRouter } from 'expo-router';

import { ChecklistEditor } from '@/src/features/checklists/ChecklistEditor';

export default function NewChecklistRoute() {
  const router = useRouter();

  return (
    <ChecklistEditor
      onSaved={() => router.back()}
      onCancel={() => router.back()}
    />
  );
}
