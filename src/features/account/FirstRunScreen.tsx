import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

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
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: 16 }}>
        <Text
          accessibilityRole="header"
          style={{ color: theme.text, fontSize: 28, fontWeight: '700' }}
        >
          Choose how to use Voice Checklist
        </Text>
        <Text style={{ color: theme.textSubtle, fontSize: 16, lineHeight: 24 }}>
          Use the app without an account, or let Google identify you for account
          management. In this release, every checklist remains on this device and
          is never uploaded.
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
            minHeight: 48,
            paddingHorizontal: 16,
            borderRadius: 24,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              color: theme.onPrimary,
              fontSize: 16,
              fontWeight: '600',
            }}
          >
            Use on this device
          </Text>
        </Pressable>

        <GoogleSignInButton
          disabled={busy}
          onPress={() => void run(onContinueWithGoogle)}
        />
      </View>
    </ScrollView>
  );
}
