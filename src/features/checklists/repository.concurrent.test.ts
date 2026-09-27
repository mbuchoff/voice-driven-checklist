import type { Database } from '@/src/db/database';
import { runMigrations } from '@/src/db/migrations';
import { SqliteDevicePreferenceStore } from '@/src/features/settings/preferences';
import { createTestDatabase } from '@/src/test/createTestDatabase';

import { createChecklist, deleteChecklist, getChecklist, listChecklists, reorderChecklists } from './repository';

function pauseBeforeRollback(database: Database) {
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  let release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  const transact = database.withTransactionAsync.bind(database);
  jest.spyOn(database, 'withTransactionAsync').mockImplementationOnce(action =>
    transact(async (...args) => {
      await action(...args);
      entered();
      await paused;
      throw new Error('simulated late save failure');
    }),
  );
  return { ready, release };
}

describe('independent operations during a failed reorder', () => {
  let database: Database;
  let first: string;
  let second: string;

  beforeEach(async () => {
    database = createTestDatabase();
    await runMigrations(database);
    second = (await createChecklist(database, { title: 'Second', items: [] })).id;
    first = (await createChecklist(database, { title: 'First', items: [] })).id;
  });

  afterEach(async () => { await database.closeAsync(); });

  it('keeps a successful hint dismissal after the reorder rolls back', async () => {
    const pause = pauseBeforeRollback(database);
    const order = reorderChecklists(database, [second, first]);
    const failedOrder = expect(order).rejects.toThrow('simulated late save failure');
    await pause.ready;
    const store = new SqliteDevicePreferenceStore(database);
    const dismissal = store.dismissRoutineReorderHint();
    pause.release();
    await failedOrder;
    await dismissal;
    await expect(store.load()).resolves.toMatchObject({ routineReorderHintDismissed: true });
  });

  it('returns committed order to a concurrent reader, never the rolled-back preview', async () => {
    const pause = pauseBeforeRollback(database);
    const order = reorderChecklists(database, [second, first]);
    const failedOrder = expect(order).rejects.toThrow('simulated late save failure');
    await pause.ready;
    const read = listChecklists(database);
    pause.release();
    await failedOrder;
    expect((await read).map(item => item.id)).toEqual([first, second]);
  });

  it('does not resurrect an independently deleted routine after rollback', async () => {
    const pause = pauseBeforeRollback(database);
    const order = reorderChecklists(database, [second, first]);
    const failedOrder = expect(order).rejects.toThrow('simulated late save failure');
    await pause.ready;
    const deletion = deleteChecklist(database, first);
    pause.release();
    await failedOrder;
    await deletion;
    await expect(getChecklist(database, first)).resolves.toBeNull();
  });
});
