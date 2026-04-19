export type RunResult = {
  changes: number;
  lastInsertRowId: number;
};

export type Database = {
  execAsync(source: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<RunResult>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  withTransactionAsync(callback: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
};
