import { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { confirmAction } from '@/src/components/confirm';
import { useTheme } from '@/src/theme/useTheme';

import {
  useAccount,
  type AccountContextValue,
} from './AccountProvider';
import { GoogleSignInButton } from './GoogleSignInButton';

export const PRIVACY_POLICY_URL =
  'https://mbuchoff.github.io/voice-driven-checklist/PRIVACY';
export const ACCOUNT_DELETION_URL =
  'https://mbuchoff.github.io/voice-driven-checklist/delete-account/';

export function AccountSettingsScreen() {
  return <AccountSettingsContent account={useAccount()} />;
}

export function AccountSettingsContent({
  account,
  openUrl = Linking.openURL,
}: {
  account: AccountContextValue;
  openUrl?: (url: string) => Promise<unknown>;
}) {
  const theme = useTheme();
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
          : 'The account change could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const confirmed = await confirmAction({
      title: 'Delete Google account?',
      message:
        'This deletes the Voice Checklist profile used for Google sign-in. Checklists on this device will be preserved.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (confirmed) {
      await run(account.deleteAccount);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
    >
      <View style={{ gap: 6 }}>
        <Text
          accessibilityRole="header"
          style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}
        >
          Account
        </Text>
        {account.state.status === 'local' ? (
          <>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>
              This device
            </Text>
            <Text style={{ color: theme.textMuted }}>
              No account is required. Your checklists stay available offline.
            </Text>
          </>
        ) : account.state.status === 'google' ? (
          <>
            {account.state.identity.displayName ? (
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>
                {account.state.identity.displayName}
              </Text>
            ) : null}
            {account.state.identity.email ? (
              <Text style={{ color: theme.textMuted }}>
                {account.state.identity.email}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={{ color: theme.textMuted }}>Account details are loading.</Text>
        )}
      </View>

      {account.state.status === 'google' &&
      account.state.sessionStatus === 'temporarily-unavailable' ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          Google could not be reached. Your checklists remain available on this
          device.
        </Text>
      ) : null}
      {account.state.status === 'google' &&
      account.state.sessionStatus === 'reauth-required' ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          This Google session is no longer valid. Sign in again to manage the
          account.
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: theme.danger }}>
          {error}
        </Text>
      ) : null}

      {account.state.status === 'local' ? (
        <GoogleSignInButton
          disabled={busy}
          onPress={() => void run(account.signIn)}
        />
      ) : null}

      {account.state.status === 'google' &&
      account.state.sessionStatus === 'active' ? (
        <>
          <ActionButton
            disabled={busy}
            label="Switch Google account"
            onPress={() => void run(account.switchGoogleAccount)}
          />
          <ActionButton
            disabled={busy}
            label="Use on this device"
            onPress={() => void run(account.selectLocal)}
          />
          <ActionButton
            destructive
            disabled={busy}
            label="Delete Google account"
            onPress={() => void confirmDelete()}
          />
        </>
      ) : null}

      {account.state.status === 'google' &&
      account.state.sessionStatus === 'temporarily-unavailable' ? (
        <>
          <ActionButton
            disabled={busy}
            label="Retry authentication"
            onPress={() => void run(account.retryAuthentication)}
          />
          <ActionButton
            disabled={busy}
            label="Switch Google account"
            onPress={() => void run(account.switchGoogleAccount)}
          />
          <ActionButton
            disabled={busy}
            label="Use on this device"
            onPress={() => void run(account.selectLocal)}
          />
        </>
      ) : null}

      {account.state.status === 'google' &&
      account.state.sessionStatus === 'reauth-required' ? (
        <>
          <ActionButton
            disabled={busy}
            label="Sign in again"
            onPress={() => void run(account.retryAuthentication)}
          />
          <ActionButton
            disabled={busy}
            label="Use on this device"
            onPress={() => void run(account.selectLocal)}
          />
        </>
      ) : null}

      <View
        style={{
          marginTop: 8,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          gap: 14,
        }}
      >
        <PolicyLink
          label="Privacy policy"
          onPress={() => void run(() => openUrl(PRIVACY_POLICY_URL))}
        />
        <PolicyLink
          label="Account deletion help"
          onPress={() => void run(() => openUrl(ACCOUNT_DELETION_URL))}
        />
      </View>
    </ScrollView>
  );
}

function ActionButton({
  label,
  onPress,
  disabled,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  destructive?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 46,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: destructive ? theme.danger : theme.border,
        opacity: disabled ? 0.6 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: destructive ? theme.danger : theme.text,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PolicyLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
    >
      <Text style={{ color: theme.primary, fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
