import type { RoutineInput } from './types';
import { validateStepText, validateRoutineTitle } from './validation';

export const BACKUP_FORMAT = 'voice-driven-checklist-backup';
export const BACKUP_VERSION = 1;

// The file keeps its original field names (`checklists`, `items`) so backups
// stay readable by every app version.
type BackupStep = { text: string };
type BackupRoutine = { title: string; items: BackupStep[] };

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

  return {
    title: title.value,
    steps: value.items.map((item) => {
      if (!isRecord(item) || typeof item.text !== 'string') {
        throw new Error('Backup file contains an invalid step.');
      }
      const text = validateStepText(item.text);
      if (!text.ok) throw new Error(text.error);
      return { text: text.value };
    }),
  };
}

export function serializeBackup(inputs: RoutineInput[]): string {
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    checklists: inputs.map(({ title, steps }) => ({
      title,
      items: steps.map(({ text }) => ({ text })),
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
