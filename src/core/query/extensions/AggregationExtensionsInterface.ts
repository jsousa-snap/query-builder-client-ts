import { Queryable } from '../Queryable';
import { AggregateSelector } from '../Types';

/**
 * Extension interface for aggregation operations
 */
export interface IQueryAggregationExtensions<T> {
  /**
   * Counts the number of records
   * @param selector Optional selector for the column to count
   * @param alias Optional alias for the result column
   */
  count<TResult = number>(selector?: AggregateSelector<T>, alias?: string): Queryable<TResult>;

  /**
   * Gets the sum of values in a column
   * @param selector Function to select the column
   * @param alias Optional alias for the result column
   */
  sum<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;

  /**
   * Gets the average value of a column
   * @param selector Function to select the column
   * @param alias Optional alias for the result column
   */
  avg<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;

  /**
   * Gets the minimum value of a column
   * @param selector Function to select the column
   * @param alias Optional alias for the result column
   */
  min<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;

  /**
   * Gets the maximum value of a column
   * @param selector Function to select the column
   * @param alias Optional alias for the result column
   */
  max<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;

  /**
   * Helper function to handle aggregation operations with correct GROUP BY semantics
   * @param selector The selector function
   * @param aggregateType The type of aggregation (SUM, AVG, MIN, MAX, COUNT)
   * @param alias The alias for the result column
   * @param useExplicitColumn For COUNT, whether to use the selected column or COUNT(*)
   */
  applyAggregation<TResult>(
    selector: AggregateSelector<T> | null,
    aggregateType: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT',
    alias: string,
    useExplicitColumn?: boolean,
  ): Queryable<TResult>;
}
