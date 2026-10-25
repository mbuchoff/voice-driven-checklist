import { isRoutineColorKey } from './routineColors';
import type { RoutineInput } from './types';
import { STEP_TIMER_ERROR, validateRoutineTitle, validateStepText, validateStepTimer } from './validation';

export const BACKUP_FORMAT = 'voice-driven-checklist-backup';
export const BACKUP_VERSION = 1;

// The file keeps its original field names (`checklists`, `items`) so backups
// stay readable by every app version.
// `timer` (seconds) and `color` are optional, so older app versions, which
// ignore fields they don't know, still import these files.
type BackupStep = { text: string; timer?: number };
type BackupRoutine = { title: string; color?: string; items: BackupStep[] };

type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  checklists: BackupRoutine[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRoutineInput(value: unknown): RoutineInput {
  if (!isRecord(value) || typeof value.title !== 'string' || !Array.isArray(value.items)) {
    throw new Error('Backup file contains an invalid routine.');
  }

  const title = validateRoutineTitle(value.title);
  if (!title.ok) throw new Error(title.error);

  const routine: RoutineInput = {
    title: title.value,
    steps: value.items.map((item) => {
      if (!isRecord(item) || typeof item.text !== 'string') {
        throw new Error('Backup file contains an invalid step.');
      }
      const text = validateStepText(item.text);
      if (!text.ok) throw new Error(text.error);
      // A step without a timer leaves the key out; a timer that's there must
      // be whole seconds from 1 to an hour (null included).
      if (!('timer' in item)) return { text: text.value, timerSeconds: null };
      const timer = validateStepTimer(item.timer);
      if (!timer.ok || timer.value === null) throw new Error(STEP_TIMER_ERROR);
      return { text: text.value, timerSeconds: timer.value };
    }),
  };
  // A color this version doesn't know gets a new one when imported.
  if (isRoutineColorKey(value.color)) routine.colorKey = value.color;
  return routine;
}

export function serializeBackup(inputs: RoutineInput[]): string {
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    checklists: inputs.map(({ title, colorKey, steps }) => ({
      title,
      ...(colorKey ? { color: colorKey } : {}),
      items: steps.map(({ text, timerSeconds }) => (
        timerSeconds ? { text, timer: timerSeconds } : { text }
      )),
    })),
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseBackup(jsonText: string): RoutineInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Could not read backup file: not valid JSON.');
  }

  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    throw new Error('This file is not a Voice Checklist backup.');
  }

  if (parsed.version !== BACKUP_VERSION) {
    throw new Error('This backup was created by a newer version of the app.');
  }

  if (!Array.isArray(parsed.checklists)) {
    throw new Error('Backup file is missing routines.');
  }

  return parsed.checklists.map(readRoutineInput);
}
