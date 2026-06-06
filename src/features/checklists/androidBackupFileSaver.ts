import { requireOptionalNativeModule } from 'expo-modules-core';

const BACKUP_MIME_TYPE = 'application/json';

type AndroidBackupFileSaverModule = {
  save(fileName: string, mimeType: string, contents: string): Promise<boolean>;
};

const nativeSaver = requireOptionalNativeModule<AndroidBackupFileSaverModule>(
  'VoiceChecklistFileSave',
);

export async function saveAndroidBackupFile(
  jsonText: string,
  suggestedName: string,
): Promise<boolean> {
  if (!nativeSaver) {
    throw new Error('Android save dialog is unavailable.');
  }

  return nativeSaver.save(suggestedName, BACKUP_MIME_TYPE, jsonText);
}
