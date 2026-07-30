import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const REFRESH_TOKEN_KEY = 'voice-checklist.auth.refresh-token.v1';

export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(refreshToken: string): Promise<void>;
  delete(): Promise<void>;
}

type SecureStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

type BrowserStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export class NativeRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly storage: SecureStorage = SecureStore) {}

  get(): Promise<string | null> {
    return this.storage.getItemAsync(REFRESH_TOKEN_KEY);
  }

  set(refreshToken: string): Promise<void> {
    return this.storage.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  }

  delete(): Promise<void> {
    return this.storage.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
}

export class BrowserRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly storage: BrowserStorage) {}

  async get(): Promise<string | null> {
    return this.storage.getItem(REFRESH_TOKEN_KEY);
  }

  async set(refreshToken: string): Promise<void> {
    this.storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }

  async delete(): Promise<void> {
    this.storage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function createRefreshTokenStore(): RefreshTokenStore {
  if (Platform.OS === 'web') {
    return new BrowserRefreshTokenStore(globalThis.localStorage);
  }
  return new NativeRefreshTokenStore();
}

export class MemoryRefreshTokenStore implements RefreshTokenStore {
  constructor(private refreshToken: string | null = null) {}

  async get(): Promise<string | null> {
    return this.refreshToken;
  }

  async set(refreshToken: string): Promise<void> {
    this.refreshToken = refreshToken;
  }

  async delete(): Promise<void> {
    this.refreshToken = null;
  }
}
