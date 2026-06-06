import { Platform } from 'react-native';

import { Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportBackupFile, pickBackupFile } from './backupIO';
import { saveAndroidBackupFile } from './androidBackupFileSaver';

jest.mock('./androidBackupFileSaver', () => ({
  saveAndroidBackupFile: jest.fn(),
}));

jest.mock('expo-file-system', () => {
  const createdFile = {
    uri: 'content://exports/voice-checklist-backup.json',
    create: jest.fn(),
    write: jest.fn(),
    text: jest.fn(),
  };
  const pickedDirectory = {
    uri: 'content://exports',
    createFile: jest.fn(() => createdFile),
  };

  class File {
    static createdFile = createdFile;

    uri: string;

    constructor(...uris: unknown[]) {
      this.uri = uris.join('/');
    }

    create = createdFile.create;
    write = createdFile.write;
    text = createdFile.text;
  }

  class Directory {
    static pickedDirectory = pickedDirectory;
    static pickDirectoryAsync = jest.fn(() => Promise.resolve(pickedDirectory));
  }

  return {
    Directory,
    File,
    Paths: { cache: 'file:///cache' },
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

type InputFixture = {
  input: HTMLInputElement;
  triggerChange: () => void;
};

type FileSystemTestFile = {
  write: jest.Mock;
};

type FileSystemTestDirectory = {
  createFile: jest.Mock<FileSystemTestFile, [string, string]>;
};

type DirectoryMock = typeof Directory & {
  pickedDirectory: FileSystemTestDirectory;
  pickDirectoryAsync: jest.Mock<Promise<FileSystemTestDirectory>, []>;
};

const saveAndroidBackupFileMock = saveAndroidBackupFile as jest.MockedFunction<
  typeof saveAndroidBackupFile
>;

function setPlatform(os: 'ios' | 'android' | 'web') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

function setGlobal(name: 'document' | 'window', value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value,
  });
}

function setupWebFileInput(fileText: () => Promise<string>): InputFixture {
  let changeHandler: EventListener | null = null;
  const file = { text: jest.fn(fileText) } as unknown as File;
  const input = {
    type: '',
    accept: '',
    style: { display: '' },
    files: [file] as unknown as FileList,
    addEventListener: jest.fn((name: string, handler: EventListener) => {
      if (name === 'change') changeHandler = handler;
    }),
    click: jest.fn(),
    remove: jest.fn(),
  } as unknown as HTMLInputElement;

  setGlobal('window', {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    setTimeout,
  });
  setGlobal('document', {
    body: { appendChild: jest.fn() },
    createElement: jest.fn(() => input),
  });

  return {
    input,
    triggerChange: () => {
      changeHandler?.({} as Event);
    },
  };
}

describe('backup file picker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('rejects when a selected web file cannot be read', async () => {
    setPlatform('web');
    const fixture = setupWebFileInput(() => Promise.reject(new Error('read failed')));

    const result = pickBackupFile();
    fixture.triggerChange();

    await expect(result).rejects.toThrow('read failed');
    expect(fixture.input.remove).toHaveBeenCalledTimes(1);
  });
});

describe('backup file exporter', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('opens the Android save-as picker instead of sharing or selecting only a folder', async () => {
    setPlatform('android');
    const directoryMock = Directory as DirectoryMock;
    saveAndroidBackupFileMock.mockResolvedValue(true);

    await exportBackupFile('{"checklists":[]}', 'voice-checklist-backup.json');

    expect(saveAndroidBackupFileMock).toHaveBeenCalledWith(
      '{"checklists":[]}',
      'voice-checklist-backup.json',
    );
    expect(directoryMock.pickDirectoryAsync).not.toHaveBeenCalled();
    expect(directoryMock.pickedDirectory.createFile).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('treats a canceled Android save-as picker as a canceled export', async () => {
    setPlatform('android');
    const directoryMock = Directory as DirectoryMock;
    saveAndroidBackupFileMock.mockResolvedValue(false);

    await expect(exportBackupFile('{"checklists":[]}', 'voice-checklist-backup.json')).resolves.toBeUndefined();

    expect(saveAndroidBackupFileMock).toHaveBeenCalledTimes(1);
    expect(directoryMock.pickedDirectory.createFile).not.toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
