import {
  BrowserRefreshTokenStore,
  NativeRefreshTokenStore,
  REFRESH_TOKEN_KEY,
} from './refreshTokenStore';

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

    await store.set('native-refresh');

    await expect(store.get()).resolves.toBe('native-refresh');
    expect(secureStorage.setItemAsync).toHaveBeenCalledWith(
      REFRESH_TOKEN_KEY,
      'native-refresh',
    );
    await store.delete();
    await expect(store.get()).resolves.toBeNull();
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

    await store.set('web-refresh');

    expect(browserStorage.setItem).toHaveBeenCalledWith(
      'voice-checklist.auth.refresh-token.v1',
      'web-refresh',
    );
    await expect(store.get()).resolves.toBe('web-refresh');
    await store.delete();
    expect(browserStorage.removeItem).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
    await expect(store.get()).resolves.toBeNull();
  });
});
