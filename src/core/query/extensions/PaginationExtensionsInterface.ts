import { Queryable } from '../Queryable';

/**
 * Extension interface for pagination operations
 */
export interface IQueryPaginationExtensions<T> {
  /**
   * Adds a LIMIT clause to the query
   * @param count The maximum number of records to return
   */
  limit(count: number): Queryable<T>;

  /**
   * Adds an OFFSET clause to the query
   * @param offset The number of records to skip
   */
  offset(offset: number): Queryable<T>;
}
