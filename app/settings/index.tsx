import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { useDevicePreferences } from '@/src/features/settings/DevicePreferencesProvider';
import { SettingsScreen } from '@/src/features/settings/SettingsScreen';
import { CueSoundPlayer } from '@/src/services/audio/CueSoundPlayer';

export default function SettingsRoute() {
  const router = useRouter();
  const { preferences } = useDevicePreferences();
  const cues = useMemo(() => new CueSoundPlayer(), []);

  useEffect(() => {
    cues.prepare(preferences.sound);
  }, [cues, preferences.sound]);

  useEffect(() => () => cues.release(), [cues]);

  return (
    <SettingsScreen
      onManageAccounts={() => router.push('/settings/account')}
      previewSound={(sound, action) => {
        cues.prepare(sound);
        void cues.play(action);
      }}
    />
  );
}
