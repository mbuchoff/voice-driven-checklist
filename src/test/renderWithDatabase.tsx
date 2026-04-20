import { act, render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import type { Database } from '@/src/db/database';
import { DatabaseProvider } from '@/src/db/DatabaseProvider';
import { runMigrations } from '@/src/db/migrations';

import { createTestDatabase } from './createTestDatabase';

export type RenderWithDatabaseResult = ReturnType<typeof render> & {
  database: Database;
};

export async function renderWithDatabase(
  ui: ReactElement,
  options: { database?: Database } & Omit<RenderOptions, 'wrapper'> = {},
): Promise<RenderWithDatabaseResult> {
  const database = options.database ?? createTestDatabase();
  if (!options.database) {
    await runMigrations(database);
  }

  const result = render(ui, {
    ...options,
    wrapper: ({ children }) => <DatabaseProvider database={database}>{children}</DatabaseProvider>,
  });

  // Flush async useEffect chains (e.g. initial data loads).
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  return { ...result, database };
}
