import { Queryable } from '../query/Queryable';
import { JoinType } from '../expressions/JoinExpression';
import { IDatabaseProvider, OrderDirection } from '../query/Types';

/**
 * Represents a database table or view
 * Provides methods to create queries against the table
 */
export class DbSet<T> {
  /**
   * Creates a new DbSet
   * @param tableName The name of the database table
   * @param alias The unique alias for the table
   */
  constructor(
    private readonly provider: IDatabaseProvider,
    private readonly tableName: string,
    private readonly alias: string,
  ) {}

  /**
   * Gets the table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Gets the table alias
   */
  getAlias(): string {
    return this.alias;
  }

  /**
   * Creates a new queryable for this table
   * @param variables Optional context variables for the query
   */
  query(variables: Record<string, any> = {}): Queryable<T> {
    return new Queryable<T>(this.provider, this.tableName, this.alias, variables);
  }

  /**
   * Creates a queryable with a WHERE clause
   * @param predicate The predicate function
   */
  where(predicate: (entity: T) => boolean): Queryable<T> {
    return this.query().where(predicate);
  }

  /**
   * Creates a queryable with a SELECT projection
   * @param selector The selector function
   */
  select<TResult>(selector: (entity: T) => TResult): Queryable<TResult> {
    return this.query().select(selector);
  }

  /**
   * Creates a queryable with a JOIN clause
   * @param target The target table to join with
   * @param sourceKeySelector Function to select the key from the source table
   * @param targetKeySelector Function to select the key from the target table
   * @param resultSelector Function to combine the source and target records
   * @param joinType The type of join to perform
   */
  join<U, TResult>(
    target: DbSet<U>,
    sourceKeySelector: (source: T) => any,
    targetKeySelector: (target: U) => any,
    resultSelector: (source: T, target: U) => TResult,
    joinType: JoinType = JoinType.INNER,
  ): Queryable<TResult> {
    return this.query().join(
      target,
      sourceKeySelector,
      targetKeySelector,
      resultSelector,
      joinType,
    );
  }

  /**
   * Creates a queryable with an ORDER BY clause
   * @param selector Function to select the ordering field
   * @param direction The sort direction
   */
  orderBy(
    selector: (entity: T) => any,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    return this.query().orderBy(selector, direction);
  }

  /**
   * Creates a queryable with a GROUP BY clause
   * @param selector Function to select the grouping fields
   */
  groupBy(selector: (entity: T) => any[]): Queryable<T> {
    return this.query().groupBy(selector);
  }

  /**
   * Creates a queryable with a LIMIT clause
   * @param count The maximum number of records to return
   */
  limit(count: number): Queryable<T> {
    return this.query().limit(count);
  }

  /**
   * Creates a queryable with an OFFSET clause
   * @param offset The number of records to skip
   */
  offset(offset: number): Queryable<T> {
    return this.query().offset(offset);
  }

  /**
   * Counts the number of records
   * @param selector Optional selector for the column to count
   */
  count<TResult = number>(selector?: (entity: T) => any): Queryable<TResult> {
    return this.query().count(selector);
  }

  /**
   * Gets the maximum value of a column
   * @param selector Function to select the column
   */
  max<TResult>(selector: (entity: T) => any): Queryable<TResult> {
    return this.query().max(selector);
  }

  /**
   * Gets the minimum value of a column
   * @param selector Function to select the column
   */
  min<TResult>(selector: (entity: T) => any): Queryable<TResult> {
    return this.query().min(selector);
  }

  /**
   * Gets the sum of values in a column
   * @param selector Function to select the column
   */
  sum<TResult>(selector: (entity: T) => any): Queryable<TResult> {
    return this.query().sum(selector);
  }

  /**
   * Gets the average value of a column
   * @param selector Function to select the column
   */
  avg<TResult>(selector: (entity: T) => any): Queryable<TResult> {
    return this.query().avg(selector);
  }

  /**
   * Creates a queryable with a HAVING clause using COUNT
   * @param predicate A function that takes the count value and returns a boolean condition
   */
  havingCount(predicate: (value: number) => boolean): Queryable<T> {
    return this.query().havingCount(predicate);
  }

  /**
   * Creates a queryable with a HAVING clause using AVG
   * @param selector Function to select the column to average
   * @param predicate A function that takes the average value and returns a boolean condition
   */
  havingAvg(selector: (entity: T) => any, predicate: (value: number) => boolean): Queryable<T> {
    return this.query().havingAvg(selector, predicate);
  }

  /**
   * Creates a queryable with a HAVING clause using SUM
   * @param selector Function to select the column to sum
   * @param predicate A function that takes the sum value and returns a boolean condition
   */
  havingSum(selector: (entity: T) => any, predicate: (value: number) => boolean): Queryable<T> {
    return this.query().havingSum(selector, predicate);
  }

  /**
   * Creates a queryable with a HAVING clause using MIN
   * @param selector Function to select the column to find the minimum value
   * @param predicate A function that takes the min value and returns a boolean condition
   */
  havingMin(selector: (entity: T) => any, predicate: (value: number) => boolean): Queryable<T> {
    return this.query().havingMin(selector, predicate);
  }

  /**
   * Creates a queryable with a HAVING clause using MAX
   * @param selector Function to select the column to find the maximum value
   * @param predicate A function that takes the max value and returns a boolean condition
   */
  havingMax(selector: (entity: T) => any, predicate: (value: number) => boolean): Queryable<T> {
    return this.query().havingMax(selector, predicate);
  }

  /**
   * Creates a queryable with an ORDER BY clause using COUNT(*)
   * @param direction The sort direction
   */
  orderByCount(direction: OrderDirection = OrderDirection.ASC): Queryable<T> {
    return this.query().orderByCount(direction);
  }

  /**
   * Creates a queryable with an ORDER BY clause using AVG
   * @param selector Function to select the column to average
   * @param direction The sort direction
   */
  orderByAvg(
    selector: (entity: T) => any,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    return this.query().orderByAvg(selector, direction);
  }

  /**
   * Creates a queryable with an ORDER BY clause using SUM
   * @param selector Function to select the column to sum
   * @param direction The sort direction
   */
  orderBySum(
    selector: (entity: T) => any,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    return this.query().orderBySum(selector, direction);
  }

  /**
   * Creates a queryable with an ORDER BY clause using MIN
   * @param selector Function to select the column to find the minimum value
   * @param direction The sort direction
   */
  orderByMin(
    selector: (entity: T) => any,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    return this.query().orderByMin(selector, direction);
  }

  /**
   * Creates a queryable with an ORDER BY clause using MAX
   * @param selector Function to select the column to find the maximum value
   * @param direction The sort direction
   */
  orderByMax(
    selector: (entity: T) => any,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    return this.query().orderByMax(selector, direction);
  }

  /**
   * Creates a queryable with a standard HAVING clause
   * @param predicate The predicate function
   */
  having(predicate: (entity: any) => boolean): Queryable<T> {
    return this.query().having(predicate);
  }

  /**
   * Converts the query to a SQL string
   */
  toQueryString(): string {
    return this.query().toQueryString();
  }
}
