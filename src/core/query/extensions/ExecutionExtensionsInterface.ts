/**
 * Extension interface for query execution operations
 */
export interface IQueryExecutionExtensions<T> {
  /**
   * Executes the query and returns all records
   */
  execAsync(): Promise<any>;
}
