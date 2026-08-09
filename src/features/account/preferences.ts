import type { Database } from '@/src/db/database';

import type { GoogleIdentity, PersistedAccountPreference } from './types';

export interface AccountPreferenceStore {
  load(): Promise<PersistedAccountPreference>;
  save(preference: PersistedAccountPreference): Promise<void>;
}

type PreferenceRow = {
  mode: 'unselected' | 'local' | 'google';
  cognito_sub: string | null;
  display_name: string | null;
  email: string | null;
};

export class SqliteAccountPreferenceStore implements AccountPreferenceStore {
  constructor(private readonly database: Database) {}

  async load(): Promise<PersistedAccountPreference> {
    const row = await this.database.getFirstAsync<PreferenceRow>(
      `SELECT mode, cognito_sub, display_name, email
       FROM account_preferences
       WHERE id = 1`,
    );
    if (!row) {
      throw new Error('Account preference is missing.');
    }

    if (row.mode === 'google') {
      if (!row.cognito_sub) {
        throw new Error('Google account preference is missing its Cognito subject.');
      }
      return {
        mode: 'google',
        identity: identityFromRow(row),
      };
    }

    return { mode: row.mode };
  }

  async save(preference: PersistedAccountPreference): Promise<void> {
    const identity = preference.mode === 'google' ? preference.identity : null;
    const result = await this.database.runAsync(
      `UPDATE account_preferences
       SET mode = ?, cognito_sub = ?, display_name = ?, email = ?
       WHERE id = 1`,
      preference.mode,
      identity?.sub ?? null,
      identity?.displayName ?? null,
      identity?.email ?? null,
    );
    if (result.changes !== 1) {
      throw new Error('Account preference is missing.');
    }
  }
}

function identityFromRow(row: PreferenceRow): GoogleIdentity {
  return {
    sub: row.cognito_sub as string,
    displayName: row.display_name,
    email: row.email,
  };
}

export class MemoryAccountPreferenceStore implements AccountPreferenceStore {
  constructor(private preference: PersistedAccountPreference = { mode: 'unselected' }) {}

  async load(): Promise<PersistedAccountPreference> {
    return this.preference;
  }

  async save(preference: PersistedAccountPreference): Promise<void> {
    this.preference = preference;
  }
}
