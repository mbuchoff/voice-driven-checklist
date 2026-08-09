import {
  BrowserRefreshTokenStore,
  NativeRefreshTokenStore,
  refreshTokenKey,
} from './refreshTokenStore';

const ADA_SUBJECT = '11111111-1111-1111-1111-111111111111';
const GRACE_SUBJECT = '22222222-2222-2222-2222-222222222222';
const LEGACY_REFRESH_TOKEN_KEY = 'voice-checklist.auth.refresh-token.v1';

describe('refresh-token storage', () => {
  it('uses native protected storage for the refresh token', async () => {
    const values = new Map<string, string>();
    const secureStorage = {
      getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
      setItemAsync: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      deleteItemAsync: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    };
    const store = new NativeRefreshTokenStore(secureStorage);

    await store.set(ADA_SUBJECT, 'native-refresh');
    await store.set(GRACE_SUBJECT, 'grace-refresh');

    await expect(store.get(ADA_SUBJECT)).resolves.toBe('native-refresh');
    await expect(store.get(GRACE_SUBJECT)).resolves.toBe('grace-refresh');
    expect(secureStorage.setItemAsync).toHaveBeenCalledWith(
      refreshTokenKey(ADA_SUBJECT),
      'native-refresh',
    );
    await store.delete(ADA_SUBJECT);
    await expect(store.get(ADA_SUBJECT)).resolves.toBeNull();
    await expect(store.get(GRACE_SUBJECT)).resolves.toBe('grace-refresh');
    await store.deleteAll();
    await expect(store.get(GRACE_SUBJECT)).resolves.toBeNull();
  });

  it('uses a namespaced origin-local browser key', async () => {
    const values = new Map<string, string>();
    const browserStorage = {
      getItem: jest.fn((key: string) => values.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        values.delete(key);
      }),
    };
    const store = new BrowserRefreshTokenStore(browserStorage);

    await store.set(ADA_SUBJECT, 'web-refresh');

    expect(browserStorage.setItem).toHaveBeenCalledWith(
      refreshTokenKey(ADA_SUBJECT),
      'web-refresh',
    );
    await expect(store.get(ADA_SUBJECT)).resolves.toBe('web-refresh');
    await store.delete(ADA_SUBJECT);
    expect(browserStorage.removeItem).toHaveBeenCalledWith(
      refreshTokenKey(ADA_SUBJECT),
    );
    await expect(store.get(ADA_SUBJECT)).resolves.toBeNull();
  });

  it('removes every browser credential when local mode is selected', async () => {
    const values = new Map<string, string>();
    const browserStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const store = new BrowserRefreshTokenStore(browserStorage);
    await store.set(ADA_SUBJECT, 'ada-refresh');
    await store.set(GRACE_SUBJECT, 'grace-refresh');

    await store.deleteAll();

    await expect(store.get(ADA_SUBJECT)).resolves.toBeNull();
    await expect(store.get(GRACE_SUBJECT)).resolves.toBeNull();
  });

  it('migrates the single-account browser credential to the cached subject', async () => {
    const values = new Map([[LEGACY_REFRESH_TOKEN_KEY, 'legacy-refresh']]);
    const browserStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const store = new BrowserRefreshTokenStore(browserStorage);

    await expect(store.get(ADA_SUBJECT)).resolves.toBe('legacy-refresh');

    expect(values.has(LEGACY_REFRESH_TOKEN_KEY)).toBe(false);
    expect(values.get(refreshTokenKey(ADA_SUBJECT))).toBe('legacy-refresh');
  });

  it('removes the single-account browser credential during all-account cleanup', async () => {
    const values = new Map([[LEGACY_REFRESH_TOKEN_KEY, 'legacy-refresh']]);
    const browserStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const store = new BrowserRefreshTokenStore(browserStorage);

    await store.deleteAll();

    expect(values.has(LEGACY_REFRESH_TOKEN_KEY)).toBe(false);
  });
});
