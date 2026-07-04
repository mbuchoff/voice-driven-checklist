import { Alert, Platform } from 'react-native';

import { confirmAction } from './confirm';

const defaultPlatformOS = Platform.OS;

describe('confirmAction', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => defaultPlatformOS,
    });
  });

  it('resolves false when a native confirmation alert is dismissed', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'android',
    });
    let nativeOptions: Parameters<typeof Alert.alert>[3];
    let onDismiss: (() => void) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, _buttons, options) => {
      nativeOptions = options;
      onDismiss = options?.onDismiss;
    });

    const result = confirmAction({
      title: 'Stop run?',
      message: 'This will end the current checklist run and return to your checklists.',
      confirmLabel: 'Stop',
      destructive: true,
    });

    expect(onDismiss).toEqual(expect.any(Function));
    expect(nativeOptions?.cancelable).toBe(true);
    onDismiss?.();
    await expect(result).resolves.toBe(false);
  });
});
