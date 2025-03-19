/**
 * Extension interface for query execution operations
 */
export interface IQueryExecutionExtensions<T> {
  /**
   * Executes the query and returns all records
   */
  toListAsync(): Promise<Record<string, any>[]>;

  /**
   * Executes the query and returns the first record or null if none exists
   */
  firstAsync(): Promise<Record<string, any> | null>;
}
