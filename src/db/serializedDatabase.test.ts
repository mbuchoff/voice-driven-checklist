import { createTestDatabaseConnection } from '@/src/test/createTestDatabase';

import type { Database, DatabaseConnection, DatabaseQueries } from './database';
import { serializeDatabase } from './serializedDatabase';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

describe('serialized database ownership', () => {
  let connection: DatabaseConnection;
  let database: Database;

  beforeEach(async () => {
    connection = createTestDatabaseConnection();
    database = serializeDatabase(connection);
    await database.execAsync('CREATE TABLE entries (value TEXT NOT NULL)');
  });

  afterEach(async () => { await database.closeAsync(); });

  it('serializes whole transactions, including queries after an async pause', async () => {
    const entered = barrier();
    const resume = barrier();
    const first = database.withTransactionAsync(async transaction => {
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'first');
      entered.release();
      await resume.promise;
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'second');
    });
    await entered.promise;
    const second = database.withTransactionAsync(async transaction => {
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'third');
    });
    resume.release();
    await Promise.all([first, second]);
    await expect(database.getAllAsync('SELECT value FROM entries ORDER BY rowid'))
      .resolves.toEqual([{ value: 'first' }, { value: 'second' }, { value: 'third' }]);
  });

  it('rolls back failed work without poisoning later queued writes', async () => {
    const first = database.withTransactionAsync(async transaction => {
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'rolled back');
      throw new Error('save failed');
    });
    const failure = expect(first).rejects.toThrow('save failed');
    const later = database.runAsync('INSERT INTO entries VALUES (?)', 'kept');
    await failure;
    await later;
    await expect(database.getAllAsync('SELECT value FROM entries'))
      .resolves.toEqual([{ value: 'kept' }]);
  });

  it('allows later work after a standalone SQL failure', async () => {
    await expect(database.runAsync('INSERT INTO absent VALUES (1)'))
      .rejects.toMatchObject({ message: expect.stringMatching(/no such table.*absent/) });
    await database.runAsync('INSERT INTO entries VALUES (?)', 'kept');
    await expect(database.getFirstAsync('SELECT value FROM entries'))
      .resolves.toEqual({ value: 'kept' });
  });

  it('recovers when SQLite already rolled back the transaction before reporting an error', async () => {
    await database.execAsync(`
      CREATE TRIGGER rollback_insert BEFORE INSERT ON entries
      WHEN NEW.value = 'rejected'
      BEGIN SELECT RAISE(ROLLBACK, 'automatic rollback'); END;
    `);
    const failed = database.withTransactionAsync(async transaction => {
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'also rolled back');
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'rejected');
    });
    const rejection = expect(failed).rejects.toMatchObject({ message: 'automatic rollback' });
    const subsequent = database.runAsync('INSERT INTO entries VALUES (?)', 'kept');
    await rejection;
    await subsequent;
    await expect(database.getAllAsync('SELECT value FROM entries'))
      .resolves.toEqual([{ value: 'kept' }]);
  });

  it('can retry recovery on the same connection after a transient rollback failure clears', async () => {
    const execute = connection.execAsync.bind(connection);
    let rollbackUnavailable = true;
    jest.spyOn(connection, 'execAsync').mockImplementation(async sql => {
      if (sql === 'ROLLBACK' && rollbackUnavailable) throw new Error('temporary rollback failure');
      return execute(sql);
    });
    await expect(database.withTransactionAsync(async transaction => {
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'uncommitted');
      throw new Error('original save error');
    })).rejects.toThrow('original save error');
    rollbackUnavailable = false;
    await database.runAsync('INSERT INTO entries VALUES (?)', 'retried');
    await expect(database.getAllAsync('SELECT value FROM entries'))
      .resolves.toEqual([{ value: 'retried' }]);
  });

  it.each(['commit', 'rollback'] as const)('rejects escaped transaction queries after %s', async outcome => {
    let escaped!: DatabaseQueries;
    const operation = database.withTransactionAsync(async transaction => {
      escaped = transaction;
      if (outcome === 'rollback') throw new Error('save failed');
    });
    if (outcome === 'rollback') await expect(operation).rejects.toThrow('save failed');
    else await operation;
    await expect(escaped.runAsync('INSERT INTO entries VALUES (?)', 'too late'))
      .rejects.toThrow('Transaction has finished');
    await expect(database.getAllAsync('SELECT value FROM entries')).resolves.toEqual([]);
  });

  it('drains accepted work before closing and rejects submissions once closing starts', async () => {
    const entered = barrier();
    const resume = barrier();
    const transaction = database.withTransactionAsync(async scoped => {
      entered.release();
      await resume.promise;
      await scoped.runAsync('INSERT INTO entries VALUES (?)', 'transaction');
    });
    await entered.promise;
    const write = database.runAsync('INSERT INTO entries VALUES (?)', 'queued');
    const read = database.getAllAsync('SELECT value FROM entries ORDER BY rowid');
    const closing = database.closeAsync();
    expect(database.closeAsync()).toBe(closing);
    const rejected = expect(database.runAsync('INSERT INTO entries VALUES (?)', 'too late'))
      .rejects.toThrow('Database is closing');
    resume.release();
    await Promise.all([transaction, write, rejected, closing]);
    await expect(read).resolves.toEqual([{ value: 'transaction' }, { value: 'queued' }]);
  });

  it.each(['open', 'unreadable'] as const)('preserves the save error and refuses queued work if rollback leaves state %s', async state => {
    const execute = connection.execAsync.bind(connection);
    jest.spyOn(connection, 'execAsync').mockImplementation(async sql => {
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
      return execute(sql);
    });
    if (state === 'unreadable') {
      jest.spyOn(connection, 'isInTransactionAsync').mockRejectedValue(new Error('state unavailable'));
    }
    const operation = database.withTransactionAsync(async transaction => {
      await transaction.runAsync('INSERT INTO entries VALUES (?)', 'uncommitted');
      throw new Error('original save error');
    });
    const failure = expect(operation).rejects.toThrow('original save error');
    const queued = expect(database.getAllAsync('SELECT value FROM entries'))
      .rejects.toThrow('Database recovery failed');
    await Promise.all([failure, queued]);
  });
});
