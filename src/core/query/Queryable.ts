// src/core/query/Queryable.ts
import { IDatabaseProvider } from './Types';
import { ExpressionBuilder } from './ExpressionBuilder';
import { LambdaParser } from './LambdaParser';
import { PropertyTracker } from './PropertyTracker';
import { TableExpression } from '../expressions/TableExpression';
import { ProjectionExpression } from '../expressions/ProjectionExpression';
import { JoinExpression } from '../expressions/JoinExpression';
import { Expression } from '../expressions/Expression';
import { OrderingExpression, SelectExpression } from '../expressions/SelectExpression';
import { SqlServerGenerationVisitor } from '../visitors/SqlServerGenerationVisitor';
import { ExpressionSerializer } from '../../utils/ExpressionSerializer';

// Import extension types
import { IQueryWhereExtensions } from './extensions/WhereExtensionsInterface';
import { IQueryJoinExtensions } from './extensions/JoinExtensionsInterface';
import { IQuerySelectExtensions } from './extensions/SelectExtensionsInterface';
import { IQueryOrderByExtensions } from './extensions/OrderByExtensionsInterface';
import { IQueryGroupByExtensions } from './extensions/GroupByExtensionsInterface';
import { IQueryHavingExtensions } from './extensions/HavingExtensionsInterface';
import { IQueryAggregationExtensions } from './extensions/AggregationExtensionsInterface';
import { IQuerySubqueryExtensions } from './extensions/SubqueryExtensionsInterface';
import { IQueryPaginationExtensions } from './extensions/PaginationExtensionsInterface';
import { IQueryExecutionExtensions } from './extensions/ExecutionExtensionsInterface';

/**
 * Represents a query that can be built and executed against a data source
 */
export class Queryable<T>
  implements
    IQueryWhereExtensions<T>,
    IQueryJoinExtensions<T>,
    IQuerySelectExtensions<T>,
    IQueryOrderByExtensions<T>,
    IQueryGroupByExtensions<T>,
    IQueryHavingExtensions<T>,
    IQueryAggregationExtensions<T>,
    IQuerySubqueryExtensions<T>,
    IQueryPaginationExtensions<T>,
    IQueryExecutionExtensions<T>
{
  // Query components
  fromTable: TableExpression;
  whereClause: Expression | null = null;
  projections: ProjectionExpression[] = [];
  joins: JoinExpression[] = [];
  groupByColumns: Expression[] = [];
  havingClause: Expression | null = null;
  orderByColumns: OrderingExpression[] = [];
  limitValue: Expression | null = null;
  offsetValue: Expression | null = null;
  isDistinct: boolean = false;

  // Property tracker
  propertyTracker: PropertyTracker;

  /**
   * Creates a new queryable
   * @param provider The database provider
   * @param tableName The name of the table
   * @param alias The alias for the table
   * @param contextVariables Context variables for the query
   * @param propertyTracker Optional property tracker
   */
  constructor(
    readonly provider: IDatabaseProvider,
    readonly tableName: string,
    readonly alias: string,
    readonly contextVariables: Record<string, any> = {},
    propertyTracker?: PropertyTracker,
  ) {
    this.expressionBuilder = new ExpressionBuilder();
    this.lambdaParser = new LambdaParser(this.expressionBuilder, contextVariables);
    this.fromTable = this.expressionBuilder.createTable(tableName, alias);

    // Initialize property tracker
    this.propertyTracker = propertyTracker || new PropertyTracker();
    this.propertyTracker.registerTable(tableName, alias);

    // Initialize all extensions - do this directly in the constructor
    const { applyWhereExtensions } = require('./extensions/WhereExtensionsImpl');
    const { applyJoinExtensions } = require('./extensions/JoinExtensionsImpl');
    const { applySelectExtensions } = require('./extensions/SelectExtensionsImpl');
    const { applyOrderByExtensions } = require('./extensions/OrderByExtensionsImpl');
    const { applyGroupByExtensions } = require('./extensions/GroupByExtensionsImpl');
    const { applyHavingExtensions } = require('./extensions/HavingExtensionsImpl');
    const { applyAggregationExtensions } = require('./extensions/AggregationExtensionsImpl');
    const { applyPaginationExtensions } = require('./extensions/PaginationExtensionsImpl');
    const { applyExecutionExtensions } = require('./extensions/ExecutionExtensionsImpl');

    // Apply all extensions
    applyWhereExtensions(this);
    applyJoinExtensions(this);
    applySelectExtensions(this);
    applyOrderByExtensions(this);
    applyGroupByExtensions(this);
    applyHavingExtensions(this);
    applyAggregationExtensions(this);
    applyPaginationExtensions(this);
    applyExecutionExtensions(this);
  }

  readonly expressionBuilder: ExpressionBuilder;
  readonly lambdaParser: LambdaParser;

  /**
   * Gets the property tracker
   */
  getPropertyTracker(): PropertyTracker {
    return this.propertyTracker;
  }

  /**
   * Adds variables to the context
   * @param variables Variables to add
   */
  withVariables(variables: Record<string, any>): Queryable<T> {
    // Create a new queryable with merged variables
    const newQueryable = new Queryable<T>(
      this.provider,
      this.tableName,
      this.alias,
      {
        ...this.contextVariables,
        ...variables,
      },
      this.propertyTracker.clone(),
    );

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
   * Creates a clone of this queryable
   */
  clone(): Queryable<T> {
    const newQueryable = new Queryable<T>(
      this.provider,
      this.tableName,
      this.alias,
      this.contextVariables,
      this.propertyTracker.clone(),
    );

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
  cloneWithNewType<TResult>(): Queryable<TResult> {
    const newQueryable = new Queryable<TResult>(
      this.provider,
      this.tableName,
      this.alias,
      this.contextVariables,
      this.propertyTracker.clone(),
    );

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
   * Sets the query to return distinct results
   */
  distinct(): Queryable<T> {
    const newQueryable = this.clone();
    newQueryable.isDistinct = true;
    return newQueryable;
  }

  /**
   * Converts the query to a metadata representation
   */
  toMetadata(): SelectExpression {
    return this.expressionBuilder.createSelect(
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
  }

  /**
   * Converts the query to a SQL string
   */
  toQueryString(): string {
    // Create the SELECT expression
    const selectExpr = this.toMetadata();

    // Create a SQL visitor
    const visitor = new SqlServerGenerationVisitor();

    // Generate the SQL
    const sql = selectExpr.accept(visitor);

    return sql;
  }

  /**
   * Determines the origin of a nested property (e.g., joined.order.amount)
   * @param path Path of the nested property
   * @returns Property source or undefined if not found
   */
  resolveNestedPropertySource(
    path: string[],
  ): { tableAlias: string; columnName: string } | undefined {
    if (!this.propertyTracker || path.length < 2) {
      return undefined;
    }

    // Step 1: Check if the first level of the path is a known object
    const firstLevel = path[0];
    const firstLevelSource = this.propertyTracker.getPropertySource(firstLevel);

    if (firstLevelSource) {
      // Step 2: Check if there's an indicator that this object belongs to a specific table
      const secondLevel = path[1];

      // Check for a wildcard registration for this object
      const wildcardKey = `${firstLevel}.*`;
      const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);

      if (wildcardSource) {
        return {
          tableAlias: wildcardSource.tableAlias,
          columnName: path[path.length - 1],
        };
      }

      // Step 3: Check if the second level matches a known table or object
      for (const tableAlias of this.propertyTracker.getTableAliases()) {
        // Check for direct match or naming pattern (e.g., order -> o)
        if (
          tableAlias === secondLevel ||
          (secondLevel.length > 0 && tableAlias === secondLevel[0])
        ) {
          return {
            tableAlias: tableAlias,
            columnName: path[path.length - 1],
          };
        }
      }

      // If the first level has a known source, use that information
      return {
        tableAlias: firstLevelSource.tableAlias,
        columnName: path[path.length - 1],
      };
    }

    // Step 4: Check if any part of the path matches a known table
    for (let i = 0; i < path.length - 1; i++) {
      const part = path[i];

      // Look for direct match with some table
      for (const tableAlias of this.propertyTracker.getTableAliases()) {
        if (tableAlias === part || (part.length > 0 && tableAlias === part[0])) {
          return {
            tableAlias: tableAlias,
            columnName: path[path.length - 1],
          };
        }
      }

      // Check if this part has a known source
      const partSource = this.propertyTracker.getPropertySource(part);
      if (partSource) {
        return {
          tableAlias: partSource.tableAlias,
          columnName: path[path.length - 1],
        };
      }
    }

    return undefined;
  }

  /**
   * Helper method to resolve a property path from a selector string
   */
  resolvePropertyPath(
    selectorStr: string,
    defaultTableAlias: string,
  ): { tableAlias: string; columnName: string; path?: string[] } {
    // For nested properties like: joined => joined.order.amount
    const nestedPropMatch = selectorStr.match(/=>\s*\w+\.(\w+)\.(\w+)/);

    if (nestedPropMatch && nestedPropMatch[1] && nestedPropMatch[2]) {
      const objectName = nestedPropMatch[1]; // "order"
      const propertyName = nestedPropMatch[2]; // "amount"

      // Extract the full path for tracking
      const fullPathMatch = selectorStr.match(/=>\s*(\w+(?:\.\w+)+)/);
      const fullPath = fullPathMatch ? fullPathMatch[1].split('.') : [objectName, propertyName];

      // Try to find the correct table in the property tracker
      if (this.propertyTracker) {
        // Check direct object registrations
        const objectSource = this.propertyTracker.getPropertySource(objectName);
        if (objectSource) {
          return {
            tableAlias: objectSource.tableAlias,
            columnName: propertyName,
            path: fullPath,
          };
        }

        // Check registered wildcards
        const wildcardKey = `${objectName}.*`;
        const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
        if (wildcardSource) {
          return {
            tableAlias: wildcardSource.tableAlias,
            columnName: propertyName,
            path: fullPath,
          };
        }

        // Check if any registered property contains this object in the path
        for (const [propName, source] of this.propertyTracker.getAllPropertySources().entries()) {
          if (
            propName === objectName ||
            (source.propertyPath && source.propertyPath.includes(objectName))
          ) {
            return {
              tableAlias: source.tableAlias,
              columnName: propertyName,
              path: fullPath,
            };
          }
        }

        // Check match with table aliases
        for (const alias of this.propertyTracker.getTableAliases()) {
          // Exact match or first letter
          if (alias === objectName || objectName.charAt(0).toLowerCase() === alias.toLowerCase()) {
            return {
              tableAlias: alias,
              columnName: propertyName,
              path: fullPath,
            };
          }
        }
      }
    }

    // For simple properties: entity => entity.property
    const simplePropMatch = selectorStr.match(/=>\s*\w+\.(\w+)/);
    if (simplePropMatch && simplePropMatch[1]) {
      return {
        tableAlias: defaultTableAlias,
        columnName: simplePropMatch[1],
      };
    }

    // Fallback for unidentified cases
    return {
      tableAlias: defaultTableAlias,
      columnName: 'id',
    };
  }

  /**
   * Helper method to extract properties from an array selector
   * @param selectorStr The selector function as a string
   */
  extractPropertiesFromArray(selectorStr: string): Array<{
    isNested: boolean;
    objectName?: string;
    propertyName: string;
  }> {
    const result: Array<{
      isNested: boolean;
      objectName?: string;
      propertyName: string;
    }> = [];

    // Extract the array part: everything between [ and ]
    const arrayMatch = selectorStr.match(/\[\s*(.+?)\s*\]/s);
    if (!arrayMatch || !arrayMatch[1]) return result;

    const arrayContent = arrayMatch[1];

    // Split by commas, accounting for possible nested structures
    const items = this.splitArrayItems(arrayContent);

    for (const item of items) {
      // Check for nested property: entity.object.property
      const nestedMatch = item.match(/\w+\.(\w+)\.(\w+)/);
      if (nestedMatch) {
        result.push({
          isNested: true,
          objectName: nestedMatch[1],
          propertyName: nestedMatch[2],
        });
      } else {
        // Simple property: entity.property
        const simpleMatch = item.match(/\w+\.(\w+)/);
        if (simpleMatch) {
          result.push({
            isNested: false,
            propertyName: simpleMatch[1],
          });
        }
      }
    }

    return result;
  }

  /**
   * Helper method to split array items correctly, respecting nested structures
   */
  splitArrayItems(arrayContent: string): string[] {
    const items: string[] = [];
    let currentItem = '';
    let parenCount = 0;
    let bracketCount = 0;

    for (let i = 0; i < arrayContent.length; i++) {
      const char = arrayContent[i];

      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;

      if (char === ',' && parenCount === 0 && bracketCount === 0) {
        items.push(currentItem.trim());
        currentItem = '';
      } else {
        currentItem += char;
      }
    }

    if (currentItem.trim()) {
      items.push(currentItem.trim());
    }

    return items;
  }

  /**
   * Methods from WhereExtensions
   */
  where!: IQueryWhereExtensions<T>['where'];
  whereIn!: IQueryWhereExtensions<T>['whereIn'];
  whereNotIn!: IQueryWhereExtensions<T>['whereNotIn'];
  whereExists!: IQueryWhereExtensions<T>['whereExists'];
  whereNotExists!: IQueryWhereExtensions<T>['whereNotExists'];
  whereCompareSubquery!: IQueryWhereExtensions<T>['whereCompareSubquery'];
  whereEqual!: IQueryWhereExtensions<T>['whereEqual'];
  whereNotEqual!: IQueryWhereExtensions<T>['whereNotEqual'];
  whereGreaterThan!: IQueryWhereExtensions<T>['whereGreaterThan'];
  whereGreaterThanOrEqual!: IQueryWhereExtensions<T>['whereGreaterThanOrEqual'];
  whereLessThan!: IQueryWhereExtensions<T>['whereLessThan'];
  whereLessThanOrEqual!: IQueryWhereExtensions<T>['whereLessThanOrEqual'];
  whereInCorrelated!: IQueryWhereExtensions<T>['whereInCorrelated'];
  whereNotInCorrelated!: IQueryWhereExtensions<T>['whereNotInCorrelated'];
  whereEqualCorrelated!: IQueryWhereExtensions<T>['whereEqualCorrelated'];
  whereNotEqualCorrelated!: IQueryWhereExtensions<T>['whereNotEqualCorrelated'];
  whereGreaterThanCorrelated!: IQueryWhereExtensions<T>['whereGreaterThanCorrelated'];
  whereGreaterThanOrEqualCorrelated!: IQueryWhereExtensions<T>['whereGreaterThanOrEqualCorrelated'];
  whereLessThanCorrelated!: IQueryWhereExtensions<T>['whereLessThanCorrelated'];
  whereLessThanOrEqualCorrelated!: IQueryWhereExtensions<T>['whereLessThanOrEqualCorrelated'];

  /**
   * Methods from JoinExtensions
   */
  join!: IQueryJoinExtensions<T>['join'];
  processNestedJoinKey!: IQueryJoinExtensions<T>['processNestedJoinKey'];
  processResultSelectorForJoin!: IQueryJoinExtensions<T>['processResultSelectorForJoin'];

  /**
   * Methods from SelectExtensions
   */
  select!: IQuerySelectExtensions<T>['select'];
  withSubquery!: IQuerySelectExtensions<T>['withSubquery'];

  /**
   * Methods from OrderByExtensions
   */
  orderBy!: IQueryOrderByExtensions<T>['orderBy'];
  orderByDesc!: IQueryOrderByExtensions<T>['orderByDesc'];
  orderByCount!: IQueryOrderByExtensions<T>['orderByCount'];
  orderByAvg!: IQueryOrderByExtensions<T>['orderByAvg'];
  orderBySum!: IQueryOrderByExtensions<T>['orderBySum'];
  orderByMin!: IQueryOrderByExtensions<T>['orderByMin'];
  orderByMax!: IQueryOrderByExtensions<T>['orderByMax'];

  /**
   * Methods from GroupByExtensions
   */
  groupBy!: IQueryGroupByExtensions<T>['groupBy'];

  /**
   * Methods from HavingExtensions
   */
  having!: IQueryHavingExtensions<T>['having'];
  havingCount!: IQueryHavingExtensions<T>['havingCount'];
  havingAvg!: IQueryHavingExtensions<T>['havingAvg'];
  havingSum!: IQueryHavingExtensions<T>['havingSum'];
  havingMin!: IQueryHavingExtensions<T>['havingMin'];
  havingMax!: IQueryHavingExtensions<T>['havingMax'];
  findColumnForAggregate!: IQueryHavingExtensions<T>['findColumnForAggregate'];

  /**
   * Methods from AggregationExtensions
   */
  count!: IQueryAggregationExtensions<T>['count'];
  sum!: IQueryAggregationExtensions<T>['sum'];
  avg!: IQueryAggregationExtensions<T>['avg'];
  min!: IQueryAggregationExtensions<T>['min'];
  max!: IQueryAggregationExtensions<T>['max'];
  applyAggregation!: IQueryAggregationExtensions<T>['applyAggregation'];

  /**
   * Methods from PaginationExtensions
   */
  limit!: IQueryPaginationExtensions<T>['limit'];
  offset!: IQueryPaginationExtensions<T>['offset'];

  /**
   * Methods from ExecutionExtensions
   */
  toListAsync!: IQueryExecutionExtensions<T>['toListAsync'];
  firstAsync!: IQueryExecutionExtensions<T>['firstAsync'];
}
