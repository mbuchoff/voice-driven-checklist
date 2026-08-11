import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { runMigrations } from '@/src/db/migrations';
import type { AccountContextValue } from '@/src/features/account/AccountProvider';
import type { AccountState } from '@/src/features/account/types';
import { serializeBackup } from '@/src/features/checklists/backup';
import {
  exportBackupFile,
  pickBackupFile,
} from '@/src/features/checklists/backupIO';
import { createChecklist, listChecklists } from '@/src/features/checklists/repository';
import { createTestDatabase } from '@/src/test/createTestDatabase';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { DevicePreferencesProvider } from './DevicePreferencesProvider';
import { MemoryDevicePreferenceStore } from './preferences';
import { SettingsContent } from './SettingsScreen';

jest.mock(
  '@/src/features/checklists/backupIO',
  () => ({
    exportBackupFile: jest.fn(),
    pickBackupFile: jest.fn(),
  }),
  { virtual: true },
);

const exportBackupFileMock = exportBackupFile as jest.MockedFunction<
  typeof exportBackupFile
>;
const pickBackupFileMock = pickBackupFile as jest.MockedFunction<
  typeof pickBackupFile
>;

function accountValue(
  state: AccountState,
  overrides: Partial<AccountContextValue> = {},
): AccountContextValue {
  return {
    state,
    selectLocal: jest.fn(async () => undefined),
    signIn: jest.fn(async () => 'completed'),
    switchGoogleAccount: jest.fn(async () => 'completed'),
    retryAuthentication: jest.fn(async () => 'completed'),
    deleteAccount: jest.fn(async () => undefined),
    ...overrides,
  };
}

async function renderSettings({
  account = accountValue({ status: 'local' }),
  store = new MemoryDevicePreferenceStore(),
  onBack = jest.fn(),
  onManageAccounts = jest.fn(),
  previewSound = jest.fn(),
}: {
  account?: AccountContextValue;
  store?: MemoryDevicePreferenceStore;
  onBack?: () => void;
  onManageAccounts?: () => void;
  previewSound?: (sound: 'chime' | 'wood' | 'ping', action: 'next') => void;
} = {}) {
  const database = createTestDatabase();
  await runMigrations(database);
  return {
    ...(await renderWithDatabase(
      <DevicePreferencesProvider store={store}>
        <SettingsContent
          account={account}
          onBack={onBack}
          onManageAccounts={onManageAccounts}
          previewSound={previewSound}
        />
      </DevicePreferencesProvider>,
      { database },
    )),
    account,
    database,
    onBack,
    onManageAccounts,
    previewSound,
    store,
  };
}

describe('SettingsContent', () => {
  beforeEach(() => {
    exportBackupFileMock.mockReset();
    exportBackupFileMock.mockResolvedValue(undefined);
    pickBackupFileMock.mockReset();
    pickBackupFileMock.mockResolvedValue(null);
  });

  it('offers device theme, step sound, backup, and account settings', async () => {
    await renderSettings();

    expect(screen.getByRole('header', { name: /theme/i })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: /step sounds/i })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: /backup.*restore/i })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: /switch account/i })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /preview completion/i })).toBeNull();
  });

  it('uses the prototype header and icon language', async () => {
    const onBack = jest.fn();
    await renderSettings({ onBack });

    fireEvent.press(screen.getByRole('button', { name: /back to my checklists/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('settings-safe-area')).toBeOnTheScreen();
    expect(screen.getByTestId('theme-system-icon')).toBeOnTheScreen();
    expect(screen.getByTestId('theme-light-icon')).toBeOnTheScreen();
    expect(screen.getByTestId('theme-dark-icon')).toBeOnTheScreen();
    expect(screen.queryByText(/[▣☀◔◖]/)).toBeNull();
  });

  it('persists an explicit theme choice and marks it selected', async () => {
    const { store } = await renderSettings();

    fireEvent.press(screen.getByRole('button', { name: /^dark/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^dark/i, selected: true }),
      ).toBeOnTheScreen();
    });
    await expect(store.load()).resolves.toMatchObject({ theme: 'dark' });
  });

  it('persists an audible sound and previews its Next cue', async () => {
    const previewSound = jest.fn();
    const { store } = await renderSettings({ previewSound });

    fireEvent.press(screen.getByRole('button', { name: /wooden tap/i }));

    await waitFor(() => expect(previewSound).toHaveBeenCalledWith('wood', 'next'));
    await expect(store.load()).resolves.toMatchObject({ sound: 'wood' });
  });

  it('selects Quiet without attempting audio playback', async () => {
    const previewSound = jest.fn();
    const { store } = await renderSettings({ previewSound });

    fireEvent.press(screen.getByRole('button', { name: /^quiet/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^quiet/i, selected: true }),
      ).toBeOnTheScreen(),
    );
    expect(previewSound).not.toHaveBeenCalled();
    await expect(store.load()).resolves.toMatchObject({ sound: 'quiet' });
  });

  it('exports checklist data without adding device preferences', async () => {
    const { database } = await renderSettings();
    await createChecklist(database, {
      title: 'Morning routine',
      items: [{ text: 'Wake up' }],
    });

    fireEvent.press(screen.getByRole('button', { name: /export backup/i }));

    await waitFor(() => expect(exportBackupFileMock).toHaveBeenCalledTimes(1));
    const [jsonText] = exportBackupFileMock.mock.calls[0];
    expect(JSON.parse(jsonText)).toMatchObject({
      version: 1,
      checklists: [
        { title: 'Morning routine', items: [{ text: 'Wake up' }] },
      ],
    });
    expect(JSON.parse(jsonText)).not.toHaveProperty('theme');
    expect(JSON.parse(jsonText)).not.toHaveProperty('sound');
    expect(JSON.parse(jsonText)).not.toHaveProperty('account');
  });

  it('imports a selected checklist backup and leaves preferences untouched', async () => {
    const store = new MemoryDevicePreferenceStore({ theme: 'dark', sound: 'ping' });
    pickBackupFileMock.mockResolvedValue(
      serializeBackup([
        { title: 'Imported checklist', items: [{ text: 'Review' }] },
      ]),
    );
    const { database } = await renderSettings({ store });

    fireEvent.press(screen.getByRole('button', { name: /import backup/i }));

    await waitFor(async () => {
      expect((await listChecklists(database)).map((item) => item.title)).toContain(
        'Imported checklist',
      );
    });
    await expect(store.load()).resolves.toEqual({ theme: 'dark', sound: 'ping' });
  });

  it('does not export an empty library', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    await renderSettings();

    fireEvent.press(screen.getByRole('button', { name: /export backup/i }));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Nothing to export',
        'Create a checklist first.',
      ),
    );
    expect(exportBackupFileMock).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('reports backup export failures without changing checklist data', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    exportBackupFileMock.mockRejectedValue(new Error('Could not write file.'));
    const { database } = await renderSettings();
    await createChecklist(database, {
      title: 'Morning routine',
      items: [{ text: 'Wake up' }],
    });

    fireEvent.press(screen.getByRole('button', { name: /export backup/i }));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Export failed', 'Could not write file.'),
    );
    await expect(listChecklists(database)).resolves.toHaveLength(1);
    alertSpy.mockRestore();
  });

  it('leaves the library unchanged when backup selection is canceled', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { database } = await renderSettings();

    fireEvent.press(screen.getByRole('button', { name: /import backup/i }));

    await waitFor(() => expect(pickBackupFileMock).toHaveBeenCalledTimes(1));
    await expect(listChecklists(database)).resolves.toEqual([]);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('does not launch a second backup picker while an import is pending', async () => {
    let finishSelection: (value: string | null) => void = () => undefined;
    pickBackupFileMock.mockImplementation(
      () => new Promise((resolve) => {
        finishSelection = resolve;
      }),
    );
    await renderSettings();

    const importButton = screen.getByRole('button', { name: /import backup/i });
    fireEvent.press(importButton);
    await waitFor(() => expect(pickBackupFileMock).toHaveBeenCalledTimes(1));
    fireEvent.press(importButton);

    expect(pickBackupFileMock).toHaveBeenCalledTimes(1);
    await act(async () => finishSelection(null));
  });

  it('reports unreadable and invalid backup files without importing them', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    pickBackupFileMock.mockRejectedValueOnce(new Error('Could not read file.'));
    const { database } = await renderSettings();

    fireEvent.press(screen.getByRole('button', { name: /import backup/i }));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Import failed', 'Could not read file.'),
    );

    pickBackupFileMock.mockResolvedValueOnce('not backup JSON');
    fireEvent.press(screen.getByRole('button', { name: /import backup/i }));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Import failed',
        'Could not read backup file: not valid JSON.',
      ),
    );
    await expect(listChecklists(database)).resolves.toEqual([]);
    alertSpy.mockRestore();
  });

  it('shows the real active Google identity and can switch to the device account', async () => {
    const selectLocal = jest.fn(async () => undefined);
    const account = accountValue(
      {
        status: 'google',
        identity: {
          sub: 'ada-sub',
          displayName: 'Ada Lovelace',
          email: 'ada@example.com',
        },
        sessionStatus: 'active',
      },
      { selectLocal },
    );
    await renderSettings({ account });

    expect(screen.getByText('Ada Lovelace')).toBeOnTheScreen();
    expect(screen.getByText('ada@example.com')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', {
        name: /ada lovelace.*selected/i,
        selected: true,
      }),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: /^this device/i }));
    await waitFor(() => expect(selectLocal).toHaveBeenCalledTimes(1));
  });

  it('routes account additions, removal, and sign-out through Manage accounts', async () => {
    const onManageAccounts = jest.fn();
    await renderSettings({ onManageAccounts });

    fireEvent.press(screen.getByRole('button', { name: /manage accounts/i }));

    expect(onManageAccounts).toHaveBeenCalledTimes(1);
  });
});
