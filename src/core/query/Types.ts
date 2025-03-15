/**
 * Defines common types used in query building
 */

/**
 * Represents the direction of an ORDER BY clause
 */
export enum OrderDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Function type for WHERE clauses
 */
export type PredicateFunction<T> = (entity: T) => boolean;

/**
 * Function type for SELECT projections
 */
export type SelectorFunction<T, TResult> = (entity: T) => TResult;

/**
 * Function type for selecting columns for ORDER BY
 */
export type OrderBySelector<T> = (entity: T) => any;

/**
 * Function type for selecting columns for GROUP BY
 */
export type GroupBySelector<T> = (entity: T) => any[];

/**
 * Function type for selecting join keys
 */
export type JoinKeySelector<T> = (entity: T) => any;

/**
 * Function type for combining results in a JOIN
 */
export type JoinResultSelector<TSource, TTarget, TResult> = (
  source: TSource,
  target: TTarget,
) => TResult;

/**
 * Function type for selecting columns for aggregation
 */
export type AggregateSelector<T> = (entity: T) => any;

/**
 * Interface for the state of a query
 */
export interface QueryState<T> {
  /**
   * Name of the table being queried
   */
  tableName: string;

  /**
   * Alias for the table
   */
  alias: string;

  /**
   * Variables that can be used in the query
   */
  contextVariables: Record<string, any>;

  /**
   * Parameter name used in the lambda expressions
   */
  parameterName: string;

  /**
   * Expression builder for constructing the query
   */
  expressionBuilder: any; // Will be defined more precisely later
}
