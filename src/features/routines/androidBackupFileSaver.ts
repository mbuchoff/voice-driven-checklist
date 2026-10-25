import { requireOptionalNativeModule } from 'expo-modules-core';

const BACKUP_MIME_TYPE = 'application/json';

type AndroidBackupFileSaverModule = {
  save(fileName: string, mimeType: string, contents: string): Promise<boolean>;
};

const nativeSaver = requireOptionalNativeModule<AndroidBackupFileSaverModule>(
  'VoiceChecklistFileSave',
);

let activeSave: Promise<boolean> | null = null;

export async function saveAndroidBackupFile(
  jsonText: string,
  suggestedName: string,
): Promise<boolean> {
  if (!nativeSaver) {
    throw new Error('Android save dialog is unavailable.');
  }

  if (activeSave) {
    throw new Error('Android save dialog is already open.');
  }

  const save = nativeSaver.save(suggestedName, BACKUP_MIME_TYPE, jsonText);
  activeSave = save;
  try {
    return await save;
  } finally {
    activeSave = null;
  }
}
