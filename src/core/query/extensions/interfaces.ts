// src/core/query/extensions/interfaces.ts
import { Queryable } from '../Queryable';
import { Expression, ExpressionType } from '../../expressions/Expression';
import {
  AggregateSelector,
  GroupBySelector,
  JoinKeySelector,
  JoinResultSelector,
  OrderBySelector,
  OrderDirection,
  PredicateFunction,
  SelectorFunction,
} from '../Types';
import { DbSet } from '../../context/DbSet';
import { JoinType } from '../../expressions/JoinExpression';
import { ColumnExpression } from '../../expressions/ColumnExpression';

// Where Extensions
export interface IQueryWhereExtensions<T> {
  where(predicate: PredicateFunction<T>): Queryable<T>;
  whereIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereNotIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereExists<U = T>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;
  whereNotExists<U = T>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;
  whereCompareSubquery<U>(
    selector: (entity: T) => any,
    operator: ExpressionType,
    subquery: Queryable<U>,
  ): Queryable<T>;
  whereEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereNotEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereGreaterThan<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereGreaterThanOrEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereLessThan<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereLessThanOrEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T>;
  whereInCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;
  whereNotInCorrelated<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T>;
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

// Join Extensions
export interface IQueryJoinExtensions<T> {
  join<U = T, TResult = T>(
    target: DbSet<U>,
    sourceKeySelector: JoinKeySelector<T>,
    targetKeySelector: JoinKeySelector<U>,
    resultSelector: JoinResultSelector<T, U, TResult>,
    joinType?: JoinType,
  ): Queryable<TResult>;

  processNestedJoinKey<S>(sourceKeySelector: (entity: S) => any): {
    tableAlias: string;
    columnName: string;
  };

  processResultSelectorForJoin(
    resultSelectorStr: string,
    sourceParamName: string,
    targetParamName: string,
    sourceTableAlias: string,
    targetTableAlias: string,
    propertyTracker: any,
  ): Map<string, { tableAlias: string; path: string[] }>;
}

// Select Extensions
export interface IQuerySelectExtensions<T> {
  select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult>;
  withSubquery<U, TResult>(
    propertyName: string,
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<TResult>,
  ): Queryable<T & Record<string, TResult>>;
}

// OrderBy Extensions
export interface IQueryOrderByExtensions<T> {
  orderBy(selector: OrderBySelector<T>, direction?: OrderDirection): Queryable<T>;
  orderByCount(direction?: OrderDirection): Queryable<T>;
  orderByAvg(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;
  orderBySum(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;
  orderByMin(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;
  orderByMax(selector: AggregateSelector<T>, direction?: OrderDirection): Queryable<T>;
}

// GroupBy Extensions
export interface IQueryGroupByExtensions<T> {
  groupBy(selector: GroupBySelector<T>): Queryable<T>;
}

// Having Extensions
export interface IQueryHavingExtensions<T> {
  having(predicate: PredicateFunction<any>): Queryable<T>;
  havingCount(predicate: (value: number) => boolean): Queryable<T>;
  havingAvg(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;
  havingSum(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;
  havingMin(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;
  havingMax(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T>;
  findColumnForAggregate(aggregateType: string): Expression;
}

// Aggregation Extensions
export interface IQueryAggregationExtensions<T> {
  count<TResult = number>(selector?: AggregateSelector<T>, alias?: string): Queryable<TResult>;
  sum<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;
  avg<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;
  min<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;
  max<TResult = T>(selector: AggregateSelector<T>, alias?: string): Queryable<TResult>;
  applyAggregation<TResult>(
    selector: AggregateSelector<T> | null,
    aggregateType: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT',
    alias: string,
    useExplicitColumn?: boolean,
  ): Queryable<TResult>;
}

// Pagination Extensions
export interface IQueryPaginationExtensions<T> {
  limit(count: number): Queryable<T>;
  offset(offset: number): Queryable<T>;
}

// Subquery Extensions
export interface IQuerySubqueryExtensions<T> {
  // Already covered in WhereExtensions and SelectExtensions
}

// Execution Extensions
export interface IQueryExecutionExtensions<T> {
  toListAsync(): Promise<Record<string, any>[]>;
  firstAsync(): Promise<Record<string, any> | null>;
}
