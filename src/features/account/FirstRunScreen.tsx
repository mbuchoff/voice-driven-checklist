import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/src/components/Icon';
import { ScreenBackground } from '@/src/components/ScreenBackground';
import { SettingsCard } from '@/src/components/SettingsCard';
import { useTheme } from '@/src/theme/useTheme';

import type { AccountActionResult } from './AccountManager';
import { GoogleSignInButton } from './GoogleSignInButton';

export function FirstRunScreen({
  onSelectLocal,
  onContinueWithGoogle,
}: {
  onSelectLocal: () => Promise<void>;
  onContinueWithGoogle: () => Promise<AccountActionResult>;
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
          : 'The account choice could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      testID="first-run-safe-area"
      style={{ flex: 1, backgroundColor: theme.background }}
    >
      <ScreenBackground variant="settings" />
      <ScrollView
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{
          flexGrow: 1,
          padding: 20,
          paddingTop: 18,
          paddingBottom: 40,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 440,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderTopLeftRadius: 11,
                borderTopRightRadius: 11,
                borderBottomRightRadius: 11,
                borderBottomLeftRadius: 4,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 6px 14px ${theme.shadow}`,
              }}
            >
              <Icon
                name="check"
                color={theme.onPrimary}
                size={19}
                strokeWidth={2.5}
                testID="first-run-brand-icon"
              />
            </View>
            <Text
              style={{
                color: theme.text,
                fontSize: 20,
                fontWeight: '700',
                letterSpacing: -0.8,
              }}
            >
              Voice Checklist
            </Text>
          </View>

          <View style={{ paddingTop: 62, paddingBottom: 34 }}>
            <Text
              style={{
                color: theme.accentDark,
                fontSize: 12,
                fontWeight: '800',
                letterSpacing: 1.56,
                marginBottom: 8,
              }}
            >
              WELCOME
            </Text>
            <Text
              style={{
                color: theme.text,
                fontSize: 40,
                lineHeight: 41,
                fontWeight: '700',
                letterSpacing: -2.2,
                marginBottom: 12,
              }}
            >
              Your routines,{`\n`}one step at a time.
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 16, lineHeight: 25 }}>
              Pick how you want to begin. Your checklist library stays on this
              device either way.
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
              START HERE
            </Text>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.text,
                fontSize: 22,
                fontWeight: '700',
                letterSpacing: -0.5,
              }}
            >
              Choose how to use Voice Checklist
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 20 }}>
              Use the app without an account, or let Google identify you for account
              management. Every checklist remains on this device and is never uploaded.
            </Text>

            {error ? (
              <Text accessibilityRole="alert" style={{ color: theme.danger }}>
                {error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void run(onSelectLocal)}
              style={{
                minHeight: 50,
                paddingHorizontal: 16,
                borderRadius: 15,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  color: theme.onPrimary,
                  fontSize: 14,
                  fontWeight: '700',
                }}
              >
                Use on this device
              </Text>
            </Pressable>

            <GoogleSignInButton
              disabled={busy}
              onPress={() => void run(onContinueWithGoogle)}
            />
          </SettingsCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
