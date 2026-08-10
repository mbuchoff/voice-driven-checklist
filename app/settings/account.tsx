import { useRouter } from 'expo-router';

import { AccountSettingsScreen } from '@/src/features/account/AccountSettingsScreen';

export default function AccountSettingsRoute() {
  const router = useRouter();
  return <AccountSettingsScreen onBack={() => router.back()} />;
}
