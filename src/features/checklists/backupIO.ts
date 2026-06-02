import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function exportBackupFile(jsonText: string, suggestedName: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof window.URL?.createObjectURL !== 'function' ||
      typeof window.URL?.revokeObjectURL !== 'function'
    ) {
      return;
    }

    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, suggestedName);
  file.create({ overwrite: true });
  file.write(jsonText);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Export checklists',
    });
  }
}

export async function pickBackupFile(): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.style.display = 'none';

      let settled = false;
      const settle = (value: string | null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', onFocus);
        input.remove();
        resolve(value);
      };
      const onFocus = () => {
        window.setTimeout(() => {
          if (!input.files?.[0]) settle(null);
        }, 500);
      };

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          settle(null);
          return;
        }
        file.text().then(settle, () => settle(null));
      });
      input.addEventListener('cancel', () => settle(null));
      window.addEventListener('focus', onFocus, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return new File(result.assets[0].uri).text();
}
