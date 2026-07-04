import type { ConfirmOptions } from '@/src/components/confirm';

export const RUN_STOP_CONFIRMATION: ConfirmOptions = {
  title: 'Stop run?',
  message: 'This will end the current checklist run and return to your checklists.',
  confirmLabel: 'Stop',
  destructive: true,
};

type RequestRunStopConfirmationOptions = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  exitRun: () => void | Promise<void>;
  pendingRef: { current: boolean };
};

export async function requestRunStopConfirmation({
  confirm,
  exitRun,
  pendingRef,
}: RequestRunStopConfirmationOptions) {
  if (pendingRef.current) return;
  pendingRef.current = true;
  try {
    const ok = await confirm(RUN_STOP_CONFIRMATION);
    if (ok) await exitRun();
  } finally {
    pendingRef.current = false;
  }
}
