import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';
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
  onBack,
  onManageAccounts,
  previewSound,
}: {
  onBack: () => void;
  onManageAccounts: () => void;
  previewSound?: (sound: AudibleSound, action: Extract<CueAction, 'next'>) => void;
}) {
  return (
    <SettingsContent
      account={useAccount()}
      onBack={onBack}
      onManageAccounts={onManageAccounts}
      previewSound={previewSound}
    />
  );
}

export function SettingsContent({
  account,
  onBack,
  onManageAccounts,
  previewSound = () => undefined,
}: {
  account: AccountContextValue;
  onBack: () => void;
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
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="settings-safe-area"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScreenBackground variant="settings" />
      <View
        style={{
          minHeight: 66,
          paddingHorizontal: 20,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.surfaceSoft,
          flexDirection: 'row',
          alignItems: 'flex-end',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to my checklists"
          onPress={onBack}
          style={{
            width: 40,
            height: 40,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 20,
            backgroundColor: theme.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="arrowLeft" color={theme.primary} size={19} />
        </Pressable>
        <Text
          style={{
            position: 'absolute',
            left: 64,
            right: 64,
            bottom: 24,
            color: theme.text,
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 1.2,
            textAlign: 'center',
          }}
        >
          SETTINGS
        </Text>
      </View>
      <ScrollView
        testID="settings-scroll"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 44, gap: 14 }}
      >
      <View style={{ paddingTop: 38, paddingBottom: 26 }}>
        <Text
          style={{ color: theme.accentDark, fontSize: 12, fontWeight: '800', letterSpacing: 1.56, marginBottom: 8 }}
        >
          MAKE IT YOURS
        </Text>
        <Text style={{ color: theme.text, fontSize: 40, lineHeight: 42, fontWeight: '700', letterSpacing: -2.2, marginBottom: 8 }}>
          Settings
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 21 }}>
          Appearance, sounds, your checklist data, and account.
        </Text>
      </View>

      <SettingsCard theme={theme}>
        <SectionHeading eyebrow="APPEARANCE" title="Theme" note="DEFAULT: SYSTEM" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ChoiceCard
            label="System"
            detail="Match this device"
            icon="monitor"
            iconTestID="theme-system-icon"
            selected={preferences.theme === 'system'}
            disabled={busy}
            onPress={() => selectTheme('system')}
          />
          <ChoiceCard
            label="Light"
            detail="Warm and bright"
            icon="sun"
            iconTestID="theme-light-icon"
            selected={preferences.theme === 'light'}
            disabled={busy}
            onPress={() => selectTheme('light')}
          />
          <ChoiceCard
            label="Dark"
            detail="Deep forest"
            icon="moon"
            iconTestID="theme-dark-icon"
            selected={preferences.theme === 'dark'}
            disabled={busy}
            onPress={() => selectTheme('dark')}
          />
        </View>
      </SettingsCard>

      <SettingsCard theme={theme}>
        <SectionHeading eyebrow="PLAYBACK" title="Step sounds" note="TAP TO PREVIEW" />
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
            icon="upload"
            disabled={busy}
            onPress={() => void exportBackup()}
          />
          <ActionButton
            label="Import backup"
            icon="download"
            disabled={busy}
            onPress={() => void importBackup()}
          />
        </View>
      </SettingsCard>

      <SettingsCard theme={theme}>
        <SectionHeading eyebrow="ACCOUNT" title="Switch account" note="CHANGES IMMEDIATELY" />
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 13 }}>
                Manage accounts
              </Text>
              <Icon name="arrowRight" color={theme.primary} size={16} />
            </View>
          </Pressable>
        </View>
      </SettingsCard>

      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}
      </ScrollView>
    </SafeAreaView>
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
        padding: 17,
        gap: 12,
        boxShadow: `0 3px 10px ${theme.shadow}`,
      }}
    >
      {children}
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.accentDark, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>
          {eyebrow}
        </Text>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.4 }}>
          {title}
        </Text>
      </View>
      {note ? (
        <Text style={{ color: theme.textFaint, fontSize: 9, fontWeight: '700', marginTop: 13 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function ChoiceCard({
  label,
  detail,
  icon,
  iconTestID,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  detail: string;
  icon: IconName;
  iconTestID?: string;
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
        backgroundColor: selected ? theme.surfaceAlt : theme.surfaceSoft,
        borderRadius: 15,
        padding: 9,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <Icon name={icon} color={theme.primary} size={21} testID={iconTestID} />
      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 11 }}>{label}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 9, textAlign: 'center' }}>{detail}</Text>
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
        backgroundColor: selected ? theme.accentSoft : theme.surfaceSoft,
        borderRadius: 15,
        padding: 9,
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
        {quiet ? (
          <Text style={{ color: theme.primary }}>—</Text>
        ) : (
          <Icon name="sound" color={theme.primary} size={15} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 11 }}>{label}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 9 }}>{detail}</Text>
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
  icon: IconName;
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
        backgroundColor: theme.surfaceSoft,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      <Icon name={icon} color={theme.primary} size={18} />
      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
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
        backgroundColor: selected ? theme.surfaceAlt : theme.surfaceSoft,
        borderRadius: 15,
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
          borderTopLeftRadius: 13,
          borderTopRightRadius: 13,
          borderBottomRightRadius: 13,
          borderBottomLeftRadius: 5,
          backgroundColor: theme.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.onPrimary, fontWeight: '800', fontSize: 11 }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{name}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 10 }}>{detail}</Text>
      </View>
      {selected ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="check" color={theme.onPrimary} size={14} />
        </View>
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
