import { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';
import { SettingsCard } from '@/src/components/SettingsCard';
import { SettingsTopBar } from '@/src/components/SettingsTopBar';
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

export function AccountSettingsScreen({ onBack }: { onBack: () => void }) {
  return <AccountSettingsContent account={useAccount()} onBack={onBack} />;
}

export function AccountSettingsContent({
  account,
  onBack = () => undefined,
  openUrl = (url) => Linking.openURL(url),
}: {
  account: AccountContextValue;
  onBack?: () => void;
  openUrl?: (url: string) => Promise<unknown>;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleIdentity =
    account.state.status === 'google'
      ? [account.state.identity.displayName, account.state.identity.email]
          .filter(Boolean)
          .join(' - ')
      : null;

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
      title: 'Delete Voice Checklist account?',
      message:
        'This deletes the Voice Checklist profile used for Google sign-in. It does not delete your Google account. Checklists on this device will be preserved.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (confirmed) {
      await run(account.deleteAccount);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="account-settings-safe-area"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScreenBackground variant="settings" />
      <SettingsTopBar
        backLabel="Back to settings"
        onBack={onBack}
        title="MANAGE ACCOUNTS"
      />
      <ScrollView
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{
          padding: 20,
          paddingTop: 0,
          paddingBottom: 44,
          gap: 14,
        }}
      >
        <View style={{ paddingTop: 38, paddingBottom: 26 }}>
          <Text
            style={{
              color: theme.accentDark,
              fontSize: 12,
              fontWeight: '800',
              letterSpacing: 1.56,
              marginBottom: 8,
            }}
          >
            ACCOUNT
          </Text>
          <Text
            accessibilityRole="header"
            style={{
              color: theme.text,
              fontSize: 40,
              lineHeight: 42,
              fontWeight: '700',
              letterSpacing: -2.2,
              marginBottom: 8,
            }}
          >
            Manage accounts
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 14, lineHeight: 21 }}>
            Choose how you use Voice Checklist.
          </Text>
        </View>

        <SettingsCard>
          <Text
            style={{
              color: theme.accentDark,
              fontSize: 9,
              fontWeight: '800',
              letterSpacing: 1.2,
            }}
          >
            CURRENT ACCOUNT
          </Text>
          <View style={{ gap: 5 }}>
            {account.state.status === 'local' ? (
              <>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
                  This device
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
                  No account is required. Your checklists stay available offline.
                </Text>
              </>
            ) : account.state.status === 'google' ? (
              googleIdentity ? (
                <Text
                  numberOfLines={1}
                  style={{ color: theme.text, fontSize: 17, fontWeight: '700' }}
                >
                  {googleIdentity}
                </Text>
              ) : null
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
                label="Switch to local mode"
                onPress={() => void run(account.selectLocal)}
              />
              <ActionButton
                destructive
                disabled={busy}
                label="Delete Voice Checklist account"
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
                label="Switch to local mode"
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
                label="Switch to local mode"
                onPress={() => void run(account.selectLocal)}
              />
            </>
          ) : null}
        </SettingsCard>

        <SettingsCard>
          <Text
            style={{
              color: theme.accentDark,
              fontSize: 9,
              fontWeight: '800',
              letterSpacing: 1.2,
            }}
          >
            HELP &amp; PRIVACY
          </Text>
          <PolicyLink
            label="Privacy policy"
            onPress={() => void run(() => openUrl(PRIVACY_POLICY_URL))}
          />
          <PolicyLink
            label="Account deletion help"
            onPress={() => void run(() => openUrl(ACCOUNT_DELETION_URL))}
          />
        </SettingsCard>
      </ScrollView>
    </SafeAreaView>
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
        minHeight: 50,
        paddingHorizontal: 14,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: destructive ? theme.danger : theme.border,
        backgroundColor: destructive ? theme.accentSoft : theme.surfaceSoft,
        opacity: disabled ? 0.6 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: destructive ? theme.danger : theme.text,
          fontSize: 13,
          fontWeight: '700',
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
      style={{
        minHeight: 48,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 15,
        backgroundColor: theme.surfaceSoft,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', flex: 1 }}>
        {label}
      </Text>
      <Icon name="arrowRight" color={theme.primary} size={17} />
    </Pressable>
  );
}
