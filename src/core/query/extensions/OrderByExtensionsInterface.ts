import { Queryable } from '../Queryable';
import { AggregateSelector, OrderBySelector, OrderDirection } from '../Types';

/**
 * Extension interface for ORDER BY clause operations
 */
export interface IQueryOrderByExtensions<T> {
  /**
   * Adds an ORDER BY clause to the query
   * @param selector Function to select the ordering field
   * @param direction The sort direction
   */
  orderBy(selector: OrderBySelector<T>, direction?: OrderDirection): Queryable<T>;

  /**
   * Orders results by the count of records in each group
   * @param direction The sort direction
   */
  orderByCount(direction?: OrderDirection): Queryable<T>;

  /**
   * Orders results by the average of values in a column
   * @param selector Function to select the column
   * @param direction The sort direction
   */
  orderByAvg(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;

  /**
   * Orders results by the sum of values in a column
   * @param selector Function to select the column
   * @param direction The sort direction
   */
  orderBySum(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;

  /**
   * Orders results by the minimum value in a column
   * @param selector Function to select the column
   * @param direction The sort direction
   */
  orderByMin(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;

  /**
   * Orders results by the maximum value in a column
   * @param selector Function to select the column
   * @param direction The sort direction
   */
  orderByMax(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;
}
