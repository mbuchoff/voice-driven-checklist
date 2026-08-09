import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useTheme } from '@/src/theme/useTheme';

import {
  useAccount,
  type AccountContextValue,
} from './AccountProvider';
import { FirstRunScreen } from './FirstRunScreen';

export function AccountGate({ children }: { children: ReactNode }) {
  return <AccountGateContent account={useAccount()}>{children}</AccountGateContent>;
}

export function AccountGateContent({
  account,
  children,
}: {
  account: AccountContextValue;
  children: ReactNode;
}) {
  const theme = useTheme();
  if (account.state.status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator accessibilityLabel="Loading account" />
      </View>
    );
  }
  if (account.state.status === 'unselected') {
    return (
      <FirstRunScreen
        onSelectLocal={account.selectLocal}
        onContinueWithGoogle={account.signIn}
      />
    );
  }

  const warning =
    account.state.status === 'google'
      ? account.state.sessionStatus === 'temporarily-unavailable'
        ? 'Google is temporarily unavailable. Your on-device checklists are still available.'
        : account.state.sessionStatus === 'reauth-required'
          ? 'Sign in again from Account settings to restore the Google session.'
          : null
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {warning ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: theme.text,
            backgroundColor: theme.surfaceAlt,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          {warning}
        </Text>
      ) : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
