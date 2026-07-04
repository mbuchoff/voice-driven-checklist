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

  it('keeps native confirmation alerts non-dismissible by default', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'android',
    });
    let nativeButtons: Parameters<typeof Alert.alert>[2];
    let nativeOptions: Parameters<typeof Alert.alert>[3];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, _buttons, options) => {
      nativeButtons = _buttons;
      nativeOptions = options;
    });

    const result = confirmAction({
      title: 'Delete checklist?',
      message: 'This checklist will be permanently removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });

    expect(nativeOptions?.cancelable).not.toBe(true);
    expect(nativeOptions?.onDismiss).toBeUndefined();
    nativeButtons?.[0]?.onPress?.();
    await expect(result).resolves.toBe(false);
  });

  it('resolves false when a dismissible native confirmation alert is dismissed', async () => {
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
      dismissible: true,
    });

    expect(onDismiss).toEqual(expect.any(Function));
    expect(nativeOptions?.cancelable).toBe(true);
    onDismiss?.();
    await expect(result).resolves.toBe(false);
  });
});
