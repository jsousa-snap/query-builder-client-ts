import { Queryable } from '../Queryable';
import { GroupBySelector } from '../Types';

/**
 * Extension interface for GROUP BY clause operations
 */
export interface IQueryGroupByExtensions<T> {
  /**
   * Adds a GROUP BY clause to the query
   * @param selector Function to select the grouping field(s)
   */
  groupBy(selector: GroupBySelector<T>): Queryable<T>;
}
