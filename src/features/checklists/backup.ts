import type { ChecklistInput } from './types';
import { validateChecklistItemText, validateChecklistTitle } from './validation';

export const BACKUP_FORMAT = 'voice-driven-checklist-backup';
export const BACKUP_VERSION = 1;

type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  checklists: ChecklistInput[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readChecklistInput(value: unknown): ChecklistInput {
  if (!isRecord(value) || typeof value.title !== 'string' || !Array.isArray(value.items)) {
    throw new Error('Backup file contains an invalid checklist.');
  }

  const title = validateChecklistTitle(value.title);
  if (!title.ok) throw new Error(title.error);

  return {
    title: title.value,
    items: value.items.map((item) => {
      if (!isRecord(item) || typeof item.text !== 'string') {
        throw new Error('Backup file contains an invalid checklist item.');
      }
      const text = validateChecklistItemText(item.text);
      if (!text.ok) throw new Error(text.error);
      return { text: text.value };
    }),
  };
}

export function serializeBackup(inputs: ChecklistInput[]): string {
  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    checklists: inputs,
  };
  return JSON.stringify(envelope, null, 2);
}

export function parseBackup(jsonText: string): ChecklistInput[] {
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
    throw new Error('Backup file is missing checklists.');
  }

  return parsed.checklists.map(readChecklistInput);
}
