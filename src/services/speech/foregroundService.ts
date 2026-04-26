import notifee, {
  AuthorizationStatus,
  AndroidForegroundServiceType,
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import { Platform } from 'react-native';

const LISTENING_NOTIFICATION_ID = 'voice-checklist-listening';
const LISTENING_CHANNEL_ID = 'voice-checklist-listening';
const STOP_ACTION_ID = 'stop';

type StopHandler = () => void | Promise<void>;
type NotificationActionEvent = {
  type: number;
  detail: { pressAction?: { id?: string } };
};

let registered = false;
let stopResolver: (() => void) | null = null;
let stopHandler: StopHandler | null = null;

export function registerListeningService(): void {
  if (registered || Platform.OS !== 'android') return;
  registered = true;

  notifee.registerForegroundService(
    () =>
      new Promise<void>((resolve) => {
        stopResolver = resolve;
      }),
  );

  notifee.onBackgroundEvent(handleNotificationAction);
  notifee.onForegroundEvent((event) => {
    void handleNotificationAction(event);
  });
}

export function setListeningNotificationStopHandler(handler: StopHandler | null): () => void {
  stopHandler = handler;
  return () => {
    stopHandler = null;
  };
}

export async function startListeningNotification(checklistTitle: string): Promise<void> {
  if (Platform.OS !== 'android') return;

  const settings = await notifee.requestPermission();
  if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
    throw new Error('Notification permission denied.');
  }

  await notifee.createChannel({
    id: LISTENING_CHANNEL_ID,
    name: 'Voice checklist listening',
    importance: AndroidImportance.HIGH,
  });

  await notifee.displayNotification({
    id: LISTENING_NOTIFICATION_ID,
    title: `Listening - ${checklistTitle}`,
    body: 'Say next, repeat, or previous',
    android: {
      channelId: LISTENING_CHANNEL_ID,
      asForegroundService: true,
      foregroundServiceTypes: [
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      ],
      ongoing: true,
      autoCancel: false,
      actions: [{ title: 'Stop', pressAction: { id: STOP_ACTION_ID } }],
    },
  });
}

export async function stopListeningNotification(): Promise<void> {
  const resolve = stopResolver;
  stopResolver = null;

  try {
    if (Platform.OS === 'android') await notifee.stopForegroundService();
  } catch {
    // The notification may already be gone when several stop paths converge.
  } finally {
    resolve?.();
  }
}

async function handleNotificationAction(event: NotificationActionEvent): Promise<void> {
  if (
    event.type !== EventType.ACTION_PRESS ||
    event.detail.pressAction?.id !== STOP_ACTION_ID
  ) {
    return;
  }

  if (stopHandler) {
    await stopHandler();
    return;
  }

  await stopListeningNotification();
}
