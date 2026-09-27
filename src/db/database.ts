export type RunResult = {
  changes: number;
  lastInsertRowId: number;
};

export type DatabaseQueries = {
  execAsync(source: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<RunResult>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
};

export type DatabaseConnection = DatabaseQueries & {
  isInTransactionAsync(): Promise<boolean>;
  closeAsync(): Promise<void>;
};

export type Database = DatabaseQueries & {
  closeAsync(): Promise<void>;
  withTransactionAsync(callback: (transaction: DatabaseQueries) => Promise<void>): Promise<void>;
};
