import { DbSet } from '../../context/DbSet';
import { Queryable } from '../Queryable';
import { SelectorFunction } from '../Types';

/**
 * Extension interface for SELECT clause operations
 */
export interface IQuerySelectExtensions<T> {
  /**
   * Adds a SELECT clause to the query
   * @param selector The selector function
   */
  select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult>;

  /**
   * Adds a subquery to the SELECT clause
   * @param propertyName Name of the property for the subquery result
   * @param subquerySource DbSet source for the subquery
   * @param parentSelector Selector for the parent query column
   * @param subquerySelector Selector for the subquery column
   * @param subqueryBuilder Function that modifies the subquery
   */
  withSubquery<U, TResult>(
    propertyName: string,
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<TResult>,
  ): Queryable<T & Record<string, TResult>>;
}
