import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY_PREFIX = 'voice-checklist.auth.refresh-token.v2';
const REFRESH_TOKEN_SUBJECTS_KEY =
  'voice-checklist.auth.refresh-token-subjects.v2';
const LEGACY_REFRESH_TOKEN_KEY = 'voice-checklist.auth.refresh-token.v1';

export interface RefreshTokenStore {
  get(subject: string): Promise<string | null>;
  set(subject: string, refreshToken: string): Promise<void>;
  delete(subject: string): Promise<void>;
  deleteAll(): Promise<void>;
  deleteAllExcept(subject: string): Promise<void>;
}

export function refreshTokenKey(subject: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(subject)) {
    throw new Error('Cognito subject contains unsupported characters.');
  }
  return `${REFRESH_TOKEN_KEY_PREFIX}.${subject}`;
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

type TokenStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

class AccountRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly storage: TokenStorage) {}

  async get(subject: string): Promise<string | null> {
    const refreshToken = await this.storage.getItem(refreshTokenKey(subject));
    if (refreshToken) return refreshToken;

    const legacyRefreshToken = await this.storage.getItem(
      LEGACY_REFRESH_TOKEN_KEY,
    );
    if (!legacyRefreshToken) return null;

    await this.set(subject, legacyRefreshToken);
    await this.storage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
    return legacyRefreshToken;
  }

  async set(subject: string, refreshToken: string): Promise<void> {
    const subjects = await this.getSubjects();
    if (!subjects.includes(subject)) {
      await this.setSubjects([...subjects, subject]);
    }
    await this.storage.setItem(refreshTokenKey(subject), refreshToken);
  }

  async delete(subject: string): Promise<void> {
    await this.storage.removeItem(refreshTokenKey(subject));
    const subjects = await this.getSubjects();
    await this.setSubjects(subjects.filter((item) => item !== subject));
  }

  async deleteAll(): Promise<void> {
    const subjects = await this.getSubjects();
    for (const subject of subjects) {
      await this.storage.removeItem(refreshTokenKey(subject));
    }
    await this.storage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
    await this.storage.removeItem(REFRESH_TOKEN_SUBJECTS_KEY);
  }

  async deleteAllExcept(subject: string): Promise<void> {
    const subjects = await this.getSubjects();
    for (const storedSubject of subjects) {
      if (storedSubject !== subject) {
        await this.storage.removeItem(refreshTokenKey(storedSubject));
      }
    }
    await this.setSubjects(
      subjects.includes(subject) ? [subject] : [],
    );
    await this.storage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  }

  private async getSubjects(): Promise<string[]> {
    const stored = await this.storage.getItem(REFRESH_TOKEN_SUBJECTS_KEY);
    if (!stored) return [];
    const subjects: unknown = JSON.parse(stored);
    if (
      !Array.isArray(subjects) ||
      !subjects.every(
        (subject) =>
          typeof subject === 'string' && /^[A-Za-z0-9._-]+$/.test(subject),
      )
    ) {
      throw new Error('Stored Cognito subjects are invalid.');
    }
    return [...new Set(subjects)];
  }

  private setSubjects(subjects: string[]): Promise<void> {
    if (subjects.length === 0) {
      return this.storage.removeItem(REFRESH_TOKEN_SUBJECTS_KEY);
    }
    return this.storage.setItem(
      REFRESH_TOKEN_SUBJECTS_KEY,
      JSON.stringify(subjects),
    );
  }
}

export class NativeRefreshTokenStore extends AccountRefreshTokenStore {
  constructor(storage: SecureStorage = SecureStore) {
    super({
      getItem: (key) => storage.getItemAsync(key),
      setItem: (key, value) => storage.setItemAsync(key, value),
      removeItem: (key) => storage.deleteItemAsync(key),
    });
  }
}

export class BrowserRefreshTokenStore extends AccountRefreshTokenStore {
  constructor(storage: BrowserStorage) {
    super({
      getItem: async (key) => storage.getItem(key),
      setItem: async (key, value) => storage.setItem(key, value),
      removeItem: async (key) => storage.removeItem(key),
    });
  }
}

export function createRefreshTokenStore(): RefreshTokenStore {
  if (Platform.OS === 'web') {
    return new BrowserRefreshTokenStore(globalThis.localStorage);
  }
  return new NativeRefreshTokenStore();
}

export class MemoryRefreshTokenStore implements RefreshTokenStore {
  private readonly refreshTokens = new Map<string, string>();

  constructor(refreshTokens: Readonly<Record<string, string>> = {}) {
    for (const [subject, refreshToken] of Object.entries(refreshTokens)) {
      this.refreshTokens.set(subject, refreshToken);
    }
  }

  async get(subject: string): Promise<string | null> {
    return this.refreshTokens.get(subject) ?? null;
  }

  async set(subject: string, refreshToken: string): Promise<void> {
    this.refreshTokens.set(subject, refreshToken);
  }

  async delete(subject: string): Promise<void> {
    this.refreshTokens.delete(subject);
  }

  async deleteAll(): Promise<void> {
    this.refreshTokens.clear();
  }

  async deleteAllExcept(subject: string): Promise<void> {
    for (const storedSubject of this.refreshTokens.keys()) {
      if (storedSubject !== subject) this.refreshTokens.delete(storedSubject);
    }
  }
}
