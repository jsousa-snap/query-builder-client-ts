import { DbSet } from '../context/DbSet';
import {
  PredicateFunction,
  SelectorFunction,
  OrderBySelector,
  GroupBySelector,
  JoinKeySelector,
  JoinResultSelector,
  AggregateSelector,
  OrderDirection,
} from './Types';

import { JoinType, JoinExpression } from '../expressions/JoinExpression';
import { OrderByExpression } from '../expressions/SelectExpression';
import { ExpressionBuilder } from './ExpressionBuilder';
import { LambdaParser } from './LambdaParser';
import { SqlGenerationVisitor } from '../visitors/SqlGenerationVisitor';
import { TableExpression } from '../expressions/TableExpression';
import { Expression } from '../expressions/Expression';
import { ProjectionExpression } from '../expressions/ProjectionExpression';
import { ColumnExpression } from '../expressions/ColumnExpression';
import { BinaryExpression } from '../expressions/BinaryExpression';
import { formatSQL, formatSQLClientStyle } from '../../utils/SqlFormatter';

/**
 * Represents a query that can be built and executed against a data source
 */
export class Queryable<T> {
  private readonly expressionBuilder: ExpressionBuilder;
  private readonly lambdaParser: LambdaParser;

  // Query components
  private fromTable: TableExpression;
  private whereClause: Expression | null = null;
  private projections: ProjectionExpression[] = [];
  private joins: JoinExpression[] = [];
  private groupByColumns: Expression[] = [];
  private havingClause: Expression | null = null;
  private orderByColumns: OrderByExpression[] = [];
  private limitValue: Expression | null = null;
  private offsetValue: Expression | null = null;
  private isDistinct: boolean = false;

  /**
   * Creates a new queryable
   * @param tableName The name of the table
   * @param alias The alias for the table
   * @param variables Context variables for the query
   */
  constructor(
    private readonly tableName: string,
    private readonly alias: string,
    private readonly contextVariables: Record<string, any> = {},
  ) {
    this.expressionBuilder = new ExpressionBuilder();
    this.lambdaParser = new LambdaParser(this.expressionBuilder, contextVariables);
    this.fromTable = this.expressionBuilder.createTable(tableName, alias);
  }

  /**
   * Adds variables to the context
   * @param variables Variables to add
   */
  withVariables(variables: Record<string, any>): Queryable<T> {
    // Create a new queryable with merged variables
    const newQueryable = new Queryable<T>(this.tableName, this.alias, {
      ...this.contextVariables,
      ...variables,
    });

    // Copy all the query components
    newQueryable.fromTable = this.fromTable;
    newQueryable.whereClause = this.whereClause;
    newQueryable.projections = [...this.projections];
    newQueryable.joins = [...this.joins];
    newQueryable.groupByColumns = [...this.groupByColumns];
    newQueryable.havingClause = this.havingClause;
    newQueryable.orderByColumns = [...this.orderByColumns];
    newQueryable.limitValue = this.limitValue;
    newQueryable.offsetValue = this.offsetValue;
    newQueryable.isDistinct = this.isDistinct;

    return newQueryable;
  }

  /**
   * Adds a WHERE clause to the query
   * @param predicate The predicate function
   */
  where(predicate: PredicateFunction<T>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Parse the predicate into an expression
    const predicateExpr = this.lambdaParser.parsePredicate<T>(predicate, this.alias);

    // If there's already a where clause, AND it with the new one
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.expressionBuilder.createAnd(
        newQueryable.whereClause,
        predicateExpr,
      );
    } else {
      newQueryable.whereClause = predicateExpr;
    }

    return newQueryable;
  }

  /**
   * Adds a SELECT clause to the query
   * @param selector The selector function
   */
  select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into a map of property -> expression
    const projections = this.lambdaParser.parseSelector<T, TResult>(selector, this.alias);

    // Convert the map to projection expressions
    newQueryable.projections = [];
    for (const [propertyName, expression] of projections.entries()) {
      newQueryable.projections.push(
        this.expressionBuilder.createProjection(expression, propertyName),
      );
    }

    return newQueryable;
  }

  /**
   * Adds a JOIN clause to the query
   * @param target The target table to join with
   * @param sourceKeySelector Function to select the key from the source table
   * @param targetKeySelector Function to select the key from the target table
   * @param resultSelector Function to combine the source and target records
   * @param joinType The type of join to perform
   */
  // join<U, TResult>(
  //   target: DbSet<U>,
  //   sourceKeySelector: JoinKeySelector<T>,
  //   targetKeySelector: JoinKeySelector<U>,
  //   resultSelector: JoinResultSelector<T, U, TResult>,
  //   joinType: JoinType = JoinType.INNER,
  // ): Queryable<TResult> {
  //   // Create a new queryable with the new result type
  //   const newQueryable = this.cloneWithNewType<TResult>();

  //   // Get the target table info
  //   const targetTableName = target.getTableName();
  //   const targetAlias = target.getAlias();

  //   // Create the target table expression
  //   const targetTable = this.expressionBuilder.createTable(targetTableName, targetAlias);

  //   // Parse the key selectors
  //   const sourceKey = this.lambdaParser.parsePredicate<T>(
  //     entity => sourceKeySelector(entity) !== null,
  //     this.alias,
  //   );

  //   const targetKey = this.lambdaParser.parsePredicate<U>(
  //     entity => targetKeySelector(entity) !== null,
  //     targetAlias,
  //   );

  //   // Extract the column expressions from the conditions
  //   let sourceColumn: ColumnExpression | null = null;
  //   let targetColumn: ColumnExpression | null = null;

  //   // Improved extraction logic
  //   const findColumnExpression = (expr: Expression): ColumnExpression | null => {
  //     if (expr instanceof ColumnExpression) {
  //       return expr;
  //     }

  //     if (expr instanceof BinaryExpression) {
  //       const left = findColumnExpression(expr.getLeft());
  //       if (left) return left;

  //       const right = findColumnExpression(expr.getRight());
  //       if (right) return right;
  //     }

  //     return null;
  //   };

  //   sourceColumn = findColumnExpression(sourceKey);
  //   targetColumn = findColumnExpression(targetKey);

  //   if (!sourceColumn || !targetColumn) {
  //     throw new Error('Could not extract join keys from selectors');
  //   }
  //   // Create the join condition
  //   const joinCondition = this.expressionBuilder.createEqual(sourceColumn, targetColumn);

  //   // Create the join expression
  //   const joinExpr = this.expressionBuilder.createJoin(targetTable, joinCondition, joinType);

  //   // Add the join to the query
  //   newQueryable.joins.push(joinExpr);

  //   return newQueryable;
  // }

  join<U, TResult>(
    target: DbSet<U>,
    sourceKeySelector: JoinKeySelector<T>,
    targetKeySelector: JoinKeySelector<U>,
    resultSelector: JoinResultSelector<T, U, TResult>,
    joinType: JoinType = JoinType.INNER,
  ): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Get the target table info
    const targetTableName = target.getTableName();
    const targetAlias = target.getAlias();

    // Create the target table expression
    const targetTable = this.expressionBuilder.createTable(targetTableName, targetAlias);

    // Use a more direct approach for extracting column names
    // We'll examine the function source to get the property name
    const getPropertyFromSelector = (selector: Function): string => {
      const fnStr = selector.toString();

      // Try to extract property pattern: x => x.propertyName
      const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);
      if (propertyMatch && propertyMatch[1]) {
        return propertyMatch[1];
      }

      // If that didn't work, try to extract from any return statement
      const returnMatch = fnStr.match(/return\s+\w+\.(\w+)/);
      if (returnMatch && returnMatch[1]) {
        return returnMatch[1];
      }

      throw new Error(`Could not extract property name from selector: ${fnStr}`);
    };

    // Extract property names
    try {
      const sourcePropertyName = getPropertyFromSelector(sourceKeySelector);
      const targetPropertyName = getPropertyFromSelector(targetKeySelector);

      // Create column expressions
      const sourceColumn = this.expressionBuilder.createColumn(sourcePropertyName, this.alias);
      const targetColumn = this.expressionBuilder.createColumn(targetPropertyName, targetAlias);

      // Create the join condition
      const joinCondition = this.expressionBuilder.createEqual(sourceColumn, targetColumn);

      // Create the join expression
      const joinExpr = this.expressionBuilder.createJoin(targetTable, joinCondition, joinType);

      // Add the join to the query
      newQueryable.joins.push(joinExpr);

      return newQueryable;
    } catch (error: any) {
      console.error('Error in join method:', error);
      throw new Error('Could not extract join keys from selectors: ' + error.message);
    }
  }

  /**
   * Adds an ORDER BY clause to the query
   * @param selector Function to select the ordering field
   * @param direction The sort direction
   */
  orderBy(
    selector: OrderBySelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Extract the column name from the selector function
    const fnStr = selector.toString();
    const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);

    if (!propertyMatch || !propertyMatch[1]) {
      throw new Error(`Could not extract property name from selector: ${fnStr}`);
    }

    // Create a column expression for the extracted property
    const column = this.expressionBuilder.createColumn(propertyMatch[1], this.alias);

    // Create the order by expression
    const orderByExpr = this.expressionBuilder.createOrderBy(
      column,
      direction === OrderDirection.ASC,
    );

    // Add the order by to the query
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  /**
   * Adds a GROUP BY clause to the query
   * @param selector Function to select the grouping fields
   */
  groupBy(selector: GroupBySelector<T>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // For groupBy we might get an array of columns
    const fnStr = selector.toString();

    // Try to extract properties from the array literal
    const propertiesMatch = fnStr.match(/\[\s*\w+\.(\w+)(?:\s*,\s*\w+\.(\w+))*\s*\]/);

    if (propertiesMatch) {
      // Process all captured groups that may contain property names
      for (let i = 1; i < propertiesMatch.length; i++) {
        if (propertiesMatch[i]) {
          const column = this.expressionBuilder.createColumn(propertiesMatch[i], this.alias);
          newQueryable.groupByColumns.push(column);
        }
      }
    } else {
      // Handle single property case
      const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);
      if (propertyMatch && propertyMatch[1]) {
        const column = this.expressionBuilder.createColumn(propertyMatch[1], this.alias);
        newQueryable.groupByColumns.push(column);
      } else {
        throw new Error(`Could not extract properties from groupBy selector: ${fnStr}`);
      }
    }

    return newQueryable;
  }

  /**
   * Adds a HAVING clause to the query
   * @param predicate The predicate function
   */
  having(predicate: PredicateFunction<T>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Parse the predicate into an expression
    const predicateExpr = this.lambdaParser.parsePredicate<T>(predicate, this.alias);

    // If there's already a having clause, AND it with the new one
    if (newQueryable.havingClause) {
      newQueryable.havingClause = this.expressionBuilder.createAnd(
        newQueryable.havingClause,
        predicateExpr,
      );
    } else {
      newQueryable.havingClause = predicateExpr;
    }

    return newQueryable;
  }

  /**
   * Adds a LIMIT clause to the query
   * @param count The maximum number of records to return
   */
  limit(count: number): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Set the limit value
    newQueryable.limitValue = this.expressionBuilder.createConstant(count);

    return newQueryable;
  }

  /**
   * Adds an OFFSET clause to the query
   * @param offset The number of records to skip
   */
  offset(offset: number): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Set the offset value
    newQueryable.offsetValue = this.expressionBuilder.createConstant(offset);

    return newQueryable;
  }

  /**
   * Sets the query to return distinct results
   */
  distinct(): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Set the distinct flag
    newQueryable.isDistinct = true;

    return newQueryable;
  }

  /**
   * Counts the number of records
   * @param selector Optional selector for the column to count
   */
  count<TResult = number>(selector?: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // If a selector is provided, parse it
    let countExpr: Expression | null = null;

    if (selector) {
      // Extract the column name
      const fnStr = selector.toString();
      const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);

      if (propertyMatch && propertyMatch[1]) {
        countExpr = this.expressionBuilder.createColumn(propertyMatch[1], this.alias);
      } else {
        throw new Error(`Could not extract property from count selector: ${fnStr}`);
      }
    }

    // Create the COUNT function
    const countFunc = this.expressionBuilder.createCount(countExpr);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(countFunc, 'count')];

    return newQueryable;
  }

  /**
   * Gets the maximum value of a column
   * @param selector Function to select the column
   */
  max<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Extract the column name
    const fnStr = selector.toString();
    const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);

    if (!propertyMatch || !propertyMatch[1]) {
      throw new Error(`Could not extract property from max selector: ${fnStr}`);
    }

    // Create column expression
    const column = this.expressionBuilder.createColumn(propertyMatch[1], this.alias);

    // Create the MAX function
    const maxFunc = this.expressionBuilder.createMax(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(maxFunc, 'max')];

    return newQueryable;
  }

  /**
   * Gets the minimum value of a column
   * @param selector Function to select the column
   */
  min<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into an expression
    const selectorExpr = this.lambdaParser.parsePredicate<T>(
      entity => selector(entity) !== null,
      this.alias,
    );

    // Extract the column expression from the condition
    let column: Expression | null = null;

    if (selectorExpr instanceof BinaryExpression) {
      // The left side should be a column expression
      column = selectorExpr.getLeft();
    } else {
      // Use the selector expression itself
      column = selectorExpr;
    }

    // Create the MIN function
    const minFunc = this.expressionBuilder.createMin(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(minFunc, 'min')];

    return newQueryable;
  }

  /**
   * Gets the sum of values in a column
   * @param selector Function to select the column
   */
  sum<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into an expression
    const selectorExpr = this.lambdaParser.parsePredicate<T>(
      entity => selector(entity) !== null,
      this.alias,
    );

    // Extract the column expression from the condition
    let column: Expression | null = null;

    if (selectorExpr instanceof BinaryExpression) {
      // The left side should be a column expression
      column = selectorExpr.getLeft();
    } else {
      // Use the selector expression itself
      column = selectorExpr;
    }

    // Create the SUM function
    const sumFunc = this.expressionBuilder.createSum(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(sumFunc, 'sum')];

    return newQueryable;
  }

  /**
   * Gets the average value of a column
   * @param selector Function to select the column
   */
  avg<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into an expression
    const selectorExpr = this.lambdaParser.parsePredicate<T>(
      entity => selector(entity) !== null,
      this.alias,
    );

    // Extract the column expression from the condition
    let column: Expression | null = null;

    if (selectorExpr instanceof BinaryExpression) {
      // The left side should be a column expression
      column = selectorExpr.getLeft();
    } else {
      // Use the selector expression itself
      column = selectorExpr;
    }

    // Create the AVG function
    const avgFunc = this.expressionBuilder.createAvg(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(avgFunc, 'avg')];

    return newQueryable;
  }

  /**
   * Converts the query to a SQL string
   */
  toQueryString(): string {
    // Create the SELECT expression
    const selectExpr = this.expressionBuilder.createSelect(
      this.projections,
      this.fromTable,
      this.joins,
      this.whereClause,
      this.groupByColumns,
      this.havingClause,
      this.orderByColumns,
      this.limitValue,
      this.offsetValue,
      this.isDistinct,
    );

    // Create a SQL visitor
    const visitor = new SqlGenerationVisitor();

    // Generate the SQL
    const sql = selectExpr.accept(visitor);

    // Format the SQL
    return formatSQLClientStyle(sql);
  }

  /**
   * Creates a clone of this queryable
   */
  private clone(): Queryable<T> {
    // Create a new queryable
    const newQueryable = new Queryable<T>(this.tableName, this.alias, this.contextVariables);

    // Copy all the query components
    newQueryable.fromTable = this.fromTable;
    newQueryable.whereClause = this.whereClause;
    newQueryable.projections = [...this.projections];
    newQueryable.joins = [...this.joins];
    newQueryable.groupByColumns = [...this.groupByColumns];
    newQueryable.havingClause = this.havingClause;
    newQueryable.orderByColumns = [...this.orderByColumns];
    newQueryable.limitValue = this.limitValue;
    newQueryable.offsetValue = this.offsetValue;
    newQueryable.isDistinct = this.isDistinct;

    return newQueryable;
  }

  /**
   * Creates a clone of this queryable with a new result type
   */
  private cloneWithNewType<TResult>(): Queryable<TResult> {
    // Create a new queryable
    const newQueryable = new Queryable<TResult>(this.tableName, this.alias, this.contextVariables);

    // Copy all the query components
    newQueryable.fromTable = this.fromTable;
    newQueryable.whereClause = this.whereClause;
    newQueryable.projections = [...this.projections];
    newQueryable.joins = [...this.joins];
    newQueryable.groupByColumns = [...this.groupByColumns];
    newQueryable.havingClause = this.havingClause;
    newQueryable.orderByColumns = [...this.orderByColumns];
    newQueryable.limitValue = this.limitValue;
    newQueryable.offsetValue = this.offsetValue;
    newQueryable.isDistinct = this.isDistinct;

    return newQueryable;
  }
}
