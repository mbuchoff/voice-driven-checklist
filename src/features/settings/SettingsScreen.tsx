import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { notify } from '@/src/components/confirm';
import { useDatabase } from '@/src/db/DatabaseProvider';
import {
  useAccount,
  type AccountContextValue,
} from '@/src/features/account/AccountProvider';
import { parseBackup, serializeBackup } from '@/src/features/checklists/backup';
import {
  exportBackupFile,
  pickBackupFile,
} from '@/src/features/checklists/backupIO';
import {
  exportAllChecklists,
  importChecklists,
} from '@/src/features/checklists/repository';
import {
  SOUND_OPTIONS,
  type CueAction,
} from '@/src/services/audio/cues';
import { useTheme } from '@/src/theme/useTheme';

import { useDevicePreferences } from './DevicePreferencesProvider';
import type { SoundPreference, ThemePreference } from './preferences';

type AudibleSound = Exclude<SoundPreference, 'quiet'>;

export function SettingsScreen({
  onManageAccounts,
  previewSound,
}: {
  onManageAccounts: () => void;
  previewSound?: (sound: AudibleSound, action: Extract<CueAction, 'next'>) => void;
}) {
  return (
    <SettingsContent
      account={useAccount()}
      onManageAccounts={onManageAccounts}
      previewSound={previewSound}
    />
  );
}

export function SettingsContent({
  account,
  onManageAccounts,
  previewSound = () => undefined,
}: {
  account: AccountContextValue;
  onManageAccounts: () => void;
  previewSound?: (sound: AudibleSound, action: Extract<CueAction, 'next'>) => void;
}) {
  const database = useDatabase();
  const theme = useTheme();
  const { preferences, setTheme, setSound } = useDevicePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'That setting could not be changed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const exportBackup = async () => {
    try {
      const inputs = await exportAllChecklists(database);
      if (inputs.length === 0) {
        await notify('Nothing to export', 'Create a checklist first.');
        return;
      }
      await exportBackupFile(
        serializeBackup(inputs),
        'voice-checklist-backup.json',
      );
    } catch (reason) {
      await notify(
        'Export failed',
        reason instanceof Error
          ? reason.message
          : 'Could not export your checklists.',
      );
    }
  };

  const importBackup = async () => {
    try {
      const text = await pickBackupFile();
      if (text == null) return;
      const inputs = parseBackup(text);
      const count = await importChecklists(database, inputs);
      await notify(
        'Import complete',
        count === 1 ? '1 checklist added.' : `${count} checklists added.`,
      );
    } catch (reason) {
      await notify(
        'Import failed',
        reason instanceof Error
          ? reason.message
          : 'Could not import that file.',
      );
    }
  };

  const selectTheme = (value: ThemePreference) => {
    void run(() => setTheme(value));
  };

  const selectSound = (value: SoundPreference) => {
    void run(async () => {
      await setSound(value);
      if (value !== 'quiet') previewSound(value, 'next');
    });
  };

  const googleIdentity = account.state.status === 'google'
    ? account.state.identity
    : null;
  const googleName = googleIdentity?.displayName || googleIdentity?.email || 'Gmail account';

  return (
    <ScrollView
      testID="settings-scroll"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 44, gap: 16 }}
    >
      <View style={{ gap: 6, marginBottom: 8 }}>
        <Text
          style={{ color: theme.danger, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }}
        >
          MAKE IT YOURS
        </Text>
        <Text style={{ color: theme.text, fontSize: 40, lineHeight: 44, fontWeight: '800' }}>
          Settings
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 16, lineHeight: 23 }}>
          Appearance, sounds, your checklist data, and account.
        </Text>
      </View>

      <SettingsCard theme={theme}>
        <SectionHeading eyebrow="APPEARANCE" title="Theme" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ChoiceCard
            label="System"
            detail="Match this device"
            icon="▣"
            selected={preferences.theme === 'system'}
            disabled={busy}
            onPress={() => selectTheme('system')}
          />
          <ChoiceCard
            label="Light"
            detail="Warm and bright"
            icon="☀"
            selected={preferences.theme === 'light'}
            disabled={busy}
            onPress={() => selectTheme('light')}
          />
          <ChoiceCard
            label="Dark"
            detail="Deep forest"
            icon="◔"
            selected={preferences.theme === 'dark'}
            disabled={busy}
            onPress={() => selectTheme('dark')}
          />
        </View>
      </SettingsCard>

      <SettingsCard theme={theme}>
        <SectionHeading eyebrow="PLAYBACK" title="Step sounds" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SOUND_OPTIONS.map((option) => (
            <SoundChoice
              key={option.id}
              label={option.label}
              detail={option.detail}
              selected={preferences.sound === option.id}
              quiet={option.id === 'quiet'}
              disabled={busy}
              onPress={() => selectSound(option.id)}
            />
          ))}
        </View>
      </SettingsCard>

      <SettingsCard theme={theme}>
        <SectionHeading eyebrow="YOUR DATA" title="Backup & restore" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ActionButton
            label="Export backup"
            icon="↥"
            disabled={busy}
            onPress={() => void exportBackup()}
          />
          <ActionButton
            label="Import backup"
            icon="↧"
            disabled={busy}
            onPress={() => void importBackup()}
          />
        </View>
      </SettingsCard>

      <SettingsCard theme={theme}>
        <SectionHeading eyebrow="ACCOUNT" title="Switch account" />
        <View style={{ gap: 8 }}>
          {googleIdentity ? (
            <AccountChoice
              initials={initialsFor(googleName)}
              name={googleName}
              detail={googleIdentity.email ?? 'Gmail'}
              selected
              disabled={busy}
              onPress={() => undefined}
            />
          ) : null}
          <AccountChoice
            initials="VC"
            name="This device"
            detail="Local checklist library"
            selected={account.state.status === 'local'}
            disabled={busy}
            onPress={() => {
              if (account.state.status !== 'local') void run(account.selectLocal);
            }}
          />
          {account.state.status === 'local' ? (
            <AccountChoice
              initials="G"
              name="Add Gmail account"
              detail="Continue with Google"
              selected={false}
              disabled={busy}
              onPress={() => void run(account.signIn)}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage accounts"
            disabled={busy}
            onPress={onManageAccounts}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>
              Manage accounts  ›
            </Text>
          </Pressable>
        </View>
      </SettingsCard>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function SettingsCard({
  theme,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 22,
        padding: 16,
        gap: 12,
        boxShadow: `0 3px 10px ${theme.shadow}`,
      }}
    >
      {children}
    </View>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: theme.danger, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }}>
        {eyebrow}
      </Text>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>
        {title}
      </Text>
    </View>
  );
}

function ChoiceCard({
  label,
  detail,
  icon,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  icon: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 92,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.primary : theme.border,
        backgroundColor: selected ? theme.surfaceAlt : theme.background,
        borderRadius: 17,
        padding: 10,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <Text style={{ color: theme.primary, fontSize: 23 }}>{icon}</Text>
      <Text style={{ color: theme.text, fontWeight: '800' }}>{label}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 10, textAlign: 'center' }}>{detail}</Text>
    </Pressable>
  );
}

function SoundChoice({
  label,
  detail,
  selected,
  quiet,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  quiet: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: '48%',
        minHeight: 68,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? theme.accentSoft : theme.background,
        borderRadius: 16,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: theme.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.primary }}>{quiet ? '—' : '◖)'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{label}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 10 }}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 62,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.background,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <Text style={{ color: theme.primary, fontSize: 20 }}>{icon}</Text>
      <Text style={{ color: theme.text, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

function AccountChoice({
  initials,
  name,
  detail,
  selected,
  disabled,
  onPress,
}: {
  initials: string;
  name: string;
  detail: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${detail}${selected ? '. Selected' : ''}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 62,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.primary : theme.border,
        backgroundColor: selected ? theme.surfaceAlt : theme.background,
        borderRadius: 16,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: theme.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.onPrimary, fontWeight: '800', fontSize: 12 }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '800' }}>{name}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{detail}</Text>
      </View>
      {selected ? (
        <Text style={{ color: theme.primary, fontSize: 20 }}>●</Text>
      ) : null}
    </Pressable>
  );
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
