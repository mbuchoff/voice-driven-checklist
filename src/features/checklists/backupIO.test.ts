import { Platform } from 'react-native';

import { pickBackupFile } from './backupIO';

type InputFixture = {
  input: HTMLInputElement;
  triggerChange: () => void;
};

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
