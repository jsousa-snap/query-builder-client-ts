import { DbSet } from '../../context/DbSet';
import { Expression, ExpressionType } from '../../expressions/Expression';
import { Queryable } from '../Queryable';
import { PredicateFunction } from '../Types';

/**
 * Extension interface for WHERE clause operations
 */
export interface IQueryWhereExtensions<T> {
  /**
   * Adds a WHERE clause to the query
   * @param predicate The predicate function
   */
  where(predicate: PredicateFunction<T>): Queryable<T>;

  /**
   * Adds a WHERE IN condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE NOT IN condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereNotIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE EXISTS condition with a correlated subquery
   * @param subquerySource Source DbSet for the subquery
   * @param parentSelector Selector for the parent query column
   * @param subquerySelector Selector for the subquery column
   * @param subqueryBuilder Function that modifies the subquery
   */
  whereExists<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  /**
   * Adds a WHERE NOT EXISTS condition with a correlated subquery
   * @param subquerySource Source DbSet for the subquery
   * @param parentSelector Selector for the parent query column
   * @param subquerySelector Selector for the subquery column
   * @param subqueryBuilder Function that modifies the subquery
   */
  whereNotExists<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  /**
   * Adds a WHERE comparison with a subquery result
   * @param selector Function to select the field to compare
   * @param operator Comparison operator
   * @param subquery The subquery to use in the condition
   */
  whereCompareSubquery<U>(
    selector: (entity: T) => any,
    operator: ExpressionType,
    subquery: Queryable<U>,
  ): Queryable<T>;

  /**
   * Adds a WHERE = condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE != condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereNotEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE > condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereGreaterThan<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE >= condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereGreaterThanOrEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE < condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereLessThan<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE <= condition with a subquery
   * @param selector Function to select the field to compare
   * @param subquery The subquery to use in the condition
   */
  whereLessThanOrEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;

  /**
   * Adds a WHERE IN condition with a correlated subquery
   * @param subquerySource Source DbSet for the subquery
   * @param parentSelector Selector for the parent query column
   * @param subquerySelector Selector for the subquery column
   * @param subqueryBuilder Function that modifies the subquery
   */
  whereInCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  /**
   * Adds a WHERE NOT IN condition with a correlated subquery
   * @param subquerySource Source DbSet for the subquery
   * @param parentSelector Selector for the parent query column
   * @param subquerySelector Selector for the subquery column
   * @param subqueryBuilder Function that modifies the subquery
   */
  whereNotInCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  /**
   * Adds other correlated comparison methods...
   */
  whereEqualCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  whereNotEqualCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  whereGreaterThanCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  whereGreaterThanOrEqualCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  whereLessThanCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;

  whereLessThanOrEqualCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;
}
