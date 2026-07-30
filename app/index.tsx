import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { AccountGate } from '@/src/features/account/AccountGate';
import { useAccount } from '@/src/features/account/AccountProvider';
import { AccountSettingsHeaderButton } from '@/src/features/account/AccountSettingsHeaderButton';
import { LibraryScreen } from '@/src/features/checklists/LibraryScreen';

export default function LibraryRoute() {
  const router = useRouter();
  const account = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  const settingsAvailable =
    account.state.status === 'local' || account.state.status === 'google';

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: settingsAvailable
            ? () => (
                <AccountSettingsHeaderButton
                  onPress={() => router.push('/settings/account')}
                />
              )
            : undefined,
        }}
      />
      <AccountGate>
        <LibraryScreen
          refreshKey={refreshKey}
          onCreate={() => router.push('/checklists/new')}
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
