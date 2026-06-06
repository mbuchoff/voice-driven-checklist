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

  it('rejects another Android save while the save picker is open', async () => {
    let finishSave: (saved: boolean) => void = () => {};
    const activeSave = new Promise<boolean>((resolve) => {
      finishSave = resolve;
    });
    const nativeModule = {
      save: jest.fn(() => activeSave),
    };
    const { saveAndroidBackupFile } = loadSaver(nativeModule);

    const firstSave = saveAndroidBackupFile('{"checklists":[1]}', 'first.json');

    await expect(saveAndroidBackupFile('{"checklists":[2]}', 'second.json')).rejects.toThrow(
      'Android save dialog is already open.',
    );

    expect(nativeModule.save).toHaveBeenCalledTimes(1);
    expect(nativeModule.save).toHaveBeenCalledWith(
      'first.json',
      'application/json',
      '{"checklists":[1]}',
    );

    finishSave(true);

    await expect(firstSave).resolves.toBe(true);
  });

  it('surfaces a clear error when the native save-as module is unavailable', async () => {
    const { saveAndroidBackupFile } = loadSaver(null);

    await expect(saveAndroidBackupFile('{"checklists":[]}', 'backup.json')).rejects.toThrow(
      'Android save dialog is unavailable.',
    );
  });
});
