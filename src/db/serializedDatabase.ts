import type { Database, DatabaseConnection, DatabaseQueries } from './database';

// One adapter owns the app's connection. Outer operations queue behind a whole
// transaction; only its callback receives queries that bypass that queue.
export function serializeDatabase(connection: DatabaseConnection): Database {
  let tail = Promise.resolve();
  let closing: Promise<void> | undefined;
  let recoveryRequired: Error | undefined;

  async function rollBackOwnedTransaction() {
    try {
      await connection.execAsync('ROLLBACK');
    } catch (error) {
      // A write may already have triggered SQLite's automatic rollback. A failed
      // state probe still rejects: unknown is not evidence of safe recovery.
      if (await connection.isInTransactionAsync()) throw error;
    }
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(new Error('Database is closing.'));
    const result = tail.then(async () => {
      if (recoveryRequired) {
        try {
          await rollBackOwnedTransaction();
        } catch {
          throw recoveryRequired;
        }
        recoveryRequired = undefined;
      }
      return operation();
    });
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  function queries(run: <T>(operation: () => Promise<T>) => Promise<T>): DatabaseQueries {
    return {
      execAsync: source => run(() => connection.execAsync(source)),
      runAsync: (sql, ...params) => run(() => connection.runAsync(sql, ...params)),
      getAllAsync: <T>(sql: string, ...params: unknown[]) =>
        run(() => connection.getAllAsync<T>(sql, ...params)),
      getFirstAsync: <T>(sql: string, ...params: unknown[]) =>
        run(() => connection.getFirstAsync<T>(sql, ...params)),
    };
  }

  return {
    ...queries(enqueue),
    withTransactionAsync: callback => enqueue(async () => {
      await connection.execAsync('BEGIN');
      let active = true;
      const transaction = queries(operation => active
        ? operation()
        : Promise.reject(new Error('Transaction has finished.')));
      try {
        // Callers must await their transaction queries before returning.
        await callback(transaction);
        active = false;
        await connection.execAsync('COMMIT');
      } catch (error) {
        active = false;
        try {
          await rollBackOwnedTransaction();
        } catch {
          recoveryRequired = new Error('Database recovery failed. Please try again; restart the app if it persists.');
        }
        throw error;
      }
    }),
    closeAsync() {
      closing ??= tail.then(() => connection.closeAsync());
      return closing;
    },
  };
}
