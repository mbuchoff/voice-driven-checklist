type NativeSaverModule = {
  save: jest.Mock;
};

function loadSaver(nativeModule: NativeSaverModule | null) {
  jest.resetModules();
  jest.doMock('expo-modules-core', () => ({
    requireOptionalNativeModule: (name: string) =>
      name === 'VoiceChecklistFileSave' ? nativeModule : null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./androidBackupFileSaver') as typeof import('./androidBackupFileSaver');
}

describe('androidBackupFileSaver', () => {
  it('sends backup text to the native Android save-as module', async () => {
    const nativeModule = {
      save: jest.fn(async () => true),
    };
    const { saveAndroidBackupFile } = loadSaver(nativeModule);

    await expect(saveAndroidBackupFile('{"checklists":[]}', 'backup.json')).resolves.toBe(true);

    expect(nativeModule.save).toHaveBeenCalledWith(
      'backup.json',
      'application/json',
      '{"checklists":[]}',
    );
  });

  it('surfaces a clear error when the native save-as module is unavailable', async () => {
    const { saveAndroidBackupFile } = loadSaver(null);

    await expect(saveAndroidBackupFile('{"checklists":[]}', 'backup.json')).rejects.toThrow(
      'Android save dialog is unavailable.',
    );
  });
});
