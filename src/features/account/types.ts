export type GoogleIdentity = {
  sub: string;
  displayName: string | null;
  email: string | null;
};

export type PersistedAccountPreference =
  | { mode: 'unselected' }
  | { mode: 'local' }
  | { mode: 'google'; identity: GoogleIdentity };

export type GoogleSessionStatus =
  | 'active'
  | 'temporarily-unavailable'
  | 'reauth-required';

export type AccountState =
  | { status: 'loading' }
  | { status: 'unselected' }
  | { status: 'local' }
  | {
      status: 'google';
      identity: GoogleIdentity;
      sessionStatus: GoogleSessionStatus;
    };
