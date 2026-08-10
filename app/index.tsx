import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { AccountGate } from '@/src/features/account/AccountGate';
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
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AccountGate>
        <LibraryScreen
          refreshKey={refreshKey}
          onCreate={() => router.push('/checklists/new')}
          onSettings={() => router.push('/settings')}
          onEdit={(id) =>
            router.push({ pathname: '/checklists/[id]/edit', params: { id } })
          }
          onStart={(id) =>
            router.push({ pathname: '/run/[id]', params: { id } })
          }
        />
      </AccountGate>
    </>
  );
}
