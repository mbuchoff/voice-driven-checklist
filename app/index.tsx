import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { LibraryScreen } from '@/src/features/checklists/LibraryScreen';

export default function LibraryRoute() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  return (
    <LibraryScreen
      refreshKey={refreshKey}
      onCreate={() => router.push('/checklists/new')}
      onEdit={(id) => router.push({ pathname: '/checklists/[id]/edit', params: { id } })}
      onStart={(id) => router.push({ pathname: '/run/[id]', params: { id } })}
    />
  );
}
