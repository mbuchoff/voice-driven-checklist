import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="index" options={{ title: 'Checklists' }} />
        <Stack.Screen name="checklists/new" options={{ title: 'New Checklist' }} />
        <Stack.Screen name="checklists/[id]/edit" options={{ title: 'Edit Checklist' }} />
        <Stack.Screen name="run/[id]" options={{ title: 'Run', headerBackVisible: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
