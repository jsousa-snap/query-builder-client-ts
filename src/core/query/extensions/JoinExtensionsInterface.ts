import { DbSet } from '../../context/DbSet';
import { JoinType } from '../../expressions/JoinExpression';
import { PropertyTracker } from '../PropertyTracker';
import { Queryable } from '../Queryable';
import { JoinKeySelector, JoinResultSelector } from '../Types';

/**
 * Extension interface for JOIN clause operations
 */
export interface IQueryJoinExtensions<T> {
  /**
   * Adds a JOIN clause to the query
   * @param target The target table to join with
   * @param sourceKeySelector Function to select the key from the source table
   * @param targetKeySelector Function to select the key from the target table
   * @param resultSelector Function to combine the source and target records
   * @param joinType The type of join to perform
   */
  join<U = T, TResult = T>(
    target: DbSet<U>,
    sourceKeySelector: JoinKeySelector<T>,
    targetKeySelector: JoinKeySelector<U>,
    resultSelector: JoinResultSelector<T, U, TResult>,
    joinType?: JoinType,
  ): Queryable<TResult>;

  /**
   * Process a nested join key
   * @param sourceKeySelector The source key selector function
   */
  processNestedJoinKey<S>(sourceKeySelector: (entity: S) => any): {
    tableAlias: string;
    columnName: string;
  };

  /**
   * Process the result selector for a join to register properties in the tracker
   * @param resultSelectorStr The result selector function as a string
   * @param sourceParamName Source parameter name
   * @param targetParamName Target parameter name
   * @param sourceTableAlias Source table alias
   * @param targetTableAlias Target table alias
   * @param propertyTracker Property tracker to register properties
   */
  processResultSelectorForJoin(
    resultSelectorStr: string,
    sourceParamName: string,
    targetParamName: string,
    sourceTableAlias: string,
    targetTableAlias: string,
    propertyTracker: PropertyTracker,
  ): Map<string, { tableAlias: string; path: string[] }>;
}
