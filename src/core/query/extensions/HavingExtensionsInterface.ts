import { Expression } from '../../expressions/Expression';
import { Queryable } from '../Queryable';
import { AggregateSelector, PredicateFunction } from '../Types';

/**
 * Extension interface for HAVING clause operations
 */
export interface IQueryHavingExtensions<T> {
  /**
   * Adds a HAVING clause to the query
   * @param predicate The predicate function
   */
  having(predicate: PredicateFunction<any>): Queryable<T>;

  /**
   * Adds a HAVING clause with COUNT aggregation
   * @param predicate Function that takes the count value and returns a boolean condition
   */
  havingCount(predicate: (value: number) => boolean): Queryable<T>;

  /**
   * Adds a HAVING clause with AVG aggregation
   * @param selector Function to select the column to average
   * @param predicate Function that takes the average value and returns a boolean condition
   */
  havingAvg(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;

  /**
   * Adds a HAVING clause with SUM aggregation
   * @param selector Function to select the column to sum
   * @param predicate Function that takes the sum value and returns a boolean condition
   */
  havingSum(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;

  /**
   * Adds a HAVING clause with MIN aggregation
   * @param selector Function to select the column to find the minimum value
   * @param predicate Function that takes the min value and returns a boolean condition
   */
  havingMin(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;

  /**
   * Adds a HAVING clause with MAX aggregation
   * @param selector Function to select the column to find the maximum value
   * @param predicate Function that takes the max value and returns a boolean condition
   */
  havingMax(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;

  /**
   * Helper method to find an appropriate column for an aggregate function
   * @param aggregateType The type of aggregate function
   */
  findColumnForAggregate(aggregateType: string): Expression;
}
