import { LambdaParser } from '../LambdaParser';
import { Queryable } from '../Queryable';
import { AggregateSelector, OrderBySelector, OrderDirection } from '../Types';
import { IQueryOrderByExtensions } from './OrderByExtensionsInterface';

/**
 * Implementation of ORDER BY clause extensions
 */
export class OrderByExtensions<T> implements IQueryOrderByExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  orderBy(
    selector: OrderBySelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Use the enhanced LambdaParser to correctly handle nested properties
    const enhancedParser = new LambdaParser(
      this.queryable.expressionBuilder,
      this.queryable.contextVariables,
      this.queryable.getPropertyTracker(),
    );

    // Parse the selector with nested property support
    const column = enhancedParser.parseAggregationSelector<T>(selector, this.queryable.alias);

    // Create the ORDER BY expression
    const orderByExpr = this.queryable.expressionBuilder.createOrderBy(
      column,
      direction === OrderDirection.ASC,
    );

    // Add the ORDER BY to the query
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  orderByDesc(selector: OrderBySelector<T>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Use the enhanced LambdaParser to correctly handle nested properties
    const enhancedParser = new LambdaParser(
      this.queryable.expressionBuilder,
      this.queryable.contextVariables,
      this.queryable.getPropertyTracker(),
    );

    // Parse the selector with nested property support
    const column = enhancedParser.parseAggregationSelector<T>(selector, this.queryable.alias);

    // Create the ORDER BY expression
    const orderByExpr = this.queryable.expressionBuilder.createOrderBy(column, false);

    // Add the ORDER BY to the query
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  orderByCount(direction: OrderDirection = OrderDirection.ASC): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Create the COUNT(*) expression
    const countExpr = this.queryable.expressionBuilder.createCount(null);

    // Create the ordering expression
    const orderByExpr = this.queryable.expressionBuilder.createOrderBy(
      countExpr,
      direction === OrderDirection.ASC,
    );

    // Add to the list of orderings
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  orderByAvg(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.queryable.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.queryable.getPropertyTracker()) {
      const propSource = this.queryable.getPropertyTracker().getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.queryable.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the AVG expression
    const avgExpr = this.queryable.expressionBuilder.createAvg(column);

    // Create the ordering expression
    const orderByExpr = this.queryable.expressionBuilder.createOrderBy(
      avgExpr,
      direction === OrderDirection.ASC,
    );

    // Add to the list of orderings
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  orderBySum(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.queryable.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.queryable.getPropertyTracker()) {
      const propSource = this.queryable.getPropertyTracker().getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.queryable.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the SUM expression
    const sumExpr = this.queryable.expressionBuilder.createSum(column);

    // Create the ordering expression
    const orderByExpr = this.queryable.expressionBuilder.createOrderBy(
      sumExpr,
      direction === OrderDirection.ASC,
    );

    // Add to the list of orderings
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  orderByMin(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.queryable.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.queryable.getPropertyTracker()) {
      const propSource = this.queryable.getPropertyTracker().getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.queryable.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the MIN expression
    const minExpr = this.queryable.expressionBuilder.createMin(column);

    // Create the ordering expression
    const orderByExpr = this.queryable.expressionBuilder.createOrderBy(
      minExpr,
      direction === OrderDirection.ASC,
    );

    // Add to the list of orderings
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  orderByMax(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.queryable.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.queryable.getPropertyTracker()) {
      const propSource = this.queryable.getPropertyTracker().getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.queryable.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the MAX expression
    const maxExpr = this.queryable.expressionBuilder.createMax(column);

    // Create the ordering expression
    const orderByExpr = this.queryable.expressionBuilder.createOrderBy(
      maxExpr,
      direction === OrderDirection.ASC,
    );

    // Add to the list of orderings
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }
}

/**
 * Extension method to apply the OrderBy extensions to Queryable
 */
export function applyOrderByExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new OrderByExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.orderBy = extensions.orderBy.bind(extensions);
  queryable.orderByDesc = extensions.orderByDesc.bind(extensions);
  queryable.orderByCount = extensions.orderByCount.bind(extensions);
  queryable.orderByAvg = extensions.orderByAvg.bind(extensions);
  queryable.orderBySum = extensions.orderBySum.bind(extensions);
  queryable.orderByMin = extensions.orderByMin.bind(extensions);
  queryable.orderByMax = extensions.orderByMax.bind(extensions);
}
