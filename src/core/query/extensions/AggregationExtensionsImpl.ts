import { ColumnExpression } from '../../expressions/ColumnExpression';
import { Expression } from '../../expressions/Expression';
import { FunctionExpression } from '../../expressions/FunctionExpression';
import { LambdaParser } from '../LambdaParser';
import { Queryable } from '../Queryable';
import { AggregateSelector } from '../Types';
import { IQueryAggregationExtensions } from './AggregationExtensionsInterface';

/**
 * Implementation of aggregation extensions
 */
export class AggregationExtensions<T> implements IQueryAggregationExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  count<TResult = number>(
    selector?: AggregateSelector<T>,
    alias: string = 'count',
  ): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector || null, 'COUNT', alias, !!selector);
  }

  sum<TResult = T>(selector: AggregateSelector<T>, alias: string = 'sum'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'SUM', alias);
  }

  avg<TResult = T>(selector: AggregateSelector<T>, alias: string = 'avg'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'AVG', alias);
  }

  min<TResult = T>(selector: AggregateSelector<T>, alias: string = 'min'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'MIN', alias);
  }

  max<TResult = T>(selector: AggregateSelector<T>, alias: string = 'max'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'MAX', alias);
  }

  applyAggregation<TResult>(
    selector: AggregateSelector<T> | null,
    aggregateType: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT',
    alias: string,
    useExplicitColumn: boolean = true,
  ): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.queryable.cloneWithNewType<TResult>();

    // Extract column information and create the aggregate function
    let aggregateFunc: Expression;

    if (!selector && aggregateType === 'COUNT') {
      // Special case: COUNT(*) with no selector
      aggregateFunc = this.queryable.expressionBuilder.createCount(null);
    } else if (selector) {
      // Extract the property name from the selector
      const selectorStr = selector.toString();
      const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

      if (propMatch && propMatch[1]) {
        // We extracted the property name, now find which table it belongs to
        const propName = propMatch[1];
        let tableAlias = this.queryable.alias; // Default to the main table
        let columnName = propName;

        // Look through the existing projections to find this property
        for (const projection of this.queryable.projections) {
          if (projection.getAlias() === propName) {
            // Found in projections - extract the table alias
            const expr = projection.getExpression();
            if (expr instanceof ColumnExpression) {
              tableAlias = expr.getTableAlias();
              columnName = expr.getColumnName();
              break;
            }
          }
        }

        // If not found in projections, check property tracker
        if (tableAlias === this.queryable.alias && this.queryable.getPropertyTracker()) {
          const propSource = this.queryable.getPropertyTracker().getPropertySource(propName);
          if (propSource) {
            tableAlias = propSource.tableAlias;
            columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
          }
        }

        // Create the column expression with the correct table alias
        const column = this.queryable.expressionBuilder.createColumn(columnName, tableAlias);

        // Create the aggregate function
        switch (aggregateType) {
          case 'SUM':
            aggregateFunc = this.queryable.expressionBuilder.createSum(column);
            break;
          case 'AVG':
            aggregateFunc = this.queryable.expressionBuilder.createAvg(column);
            break;
          case 'MIN':
            aggregateFunc = this.queryable.expressionBuilder.createMin(column);
            break;
          case 'MAX':
            aggregateFunc = this.queryable.expressionBuilder.createMax(column);
            break;
          case 'COUNT':
            aggregateFunc = this.queryable.expressionBuilder.createCount(
              useExplicitColumn ? column : null,
            );
            break;
        }
      } else {
        // Fall back to the enhanced parser approach if we couldn't extract the property
        const enhancedParser = new LambdaParser(
          this.queryable.expressionBuilder,
          this.queryable.contextVariables,
          this.queryable.getPropertyTracker(),
        );

        const column = enhancedParser.parseAggregationSelector<T>(selector, this.queryable.alias);

        // Create the aggregate function
        switch (aggregateType) {
          case 'SUM':
            aggregateFunc = this.queryable.expressionBuilder.createSum(column);
            break;
          case 'AVG':
            aggregateFunc = this.queryable.expressionBuilder.createAvg(column);
            break;
          case 'MIN':
            aggregateFunc = this.queryable.expressionBuilder.createMin(column);
            break;
          case 'MAX':
            aggregateFunc = this.queryable.expressionBuilder.createMax(column);
            break;
          case 'COUNT':
            aggregateFunc = this.queryable.expressionBuilder.createCount(
              useExplicitColumn ? column : null,
            );
            break;
        }
      }
    } else {
      // Default fallback for other cases
      const enhancedParser = new LambdaParser(
        this.queryable.expressionBuilder,
        this.queryable.contextVariables,
        this.queryable.getPropertyTracker(),
      );

      // Use a generic expression if no selector is provided (except for COUNT)
      const column = selector
        ? enhancedParser.parseAggregationSelector<T>(selector, this.queryable.alias)
        : this.queryable.expressionBuilder.createConstant('*');

      // Create the aggregate function
      switch (aggregateType) {
        case 'SUM':
          aggregateFunc = this.queryable.expressionBuilder.createSum(column);
          break;
        case 'AVG':
          aggregateFunc = this.queryable.expressionBuilder.createAvg(column);
          break;
        case 'MIN':
          aggregateFunc = this.queryable.expressionBuilder.createMin(column);
          break;
        case 'MAX':
          aggregateFunc = this.queryable.expressionBuilder.createMax(column);
          break;
        case 'COUNT':
          aggregateFunc = this.queryable.expressionBuilder.createCount(null);
          break;
      }
    }

    // Filter projections to only include ones that are part of the GROUP BY or aggregates
    if (this.queryable.groupByColumns.length > 0) {
      // Map GROUP BY columns to strings for easy comparison
      const groupByColumns = this.queryable.groupByColumns
        .map(col => {
          if (col instanceof ColumnExpression) {
            return `${col.getTableAlias()}.${col.getColumnName()}`;
          }
          return null;
        })
        .filter(Boolean) as string[];

      // Filter projections to only include valid columns for GROUP BY
      newQueryable.projections = this.queryable.projections.filter(projection => {
        const expr = projection.getExpression();

        // Keep if it's already an aggregate function
        if (
          expr instanceof FunctionExpression &&
          ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'].includes(expr.getFunctionName())
        ) {
          return true;
        }

        // Keep if it's a column that's part of the GROUP BY
        if (expr instanceof ColumnExpression) {
          const columnKey = `${expr.getTableAlias()}.${expr.getColumnName()}`;
          return groupByColumns.includes(columnKey);
        }

        // Conservatively keep expressions we can't analyze
        return false;
      });
    } else {
      // If there's no GROUP BY, we're adding an aggregate to a regular query
      // Keep existing projections
      newQueryable.projections = [...this.queryable.projections];
    }

    // Add the aggregate function projection
    newQueryable.projections.push(
      this.queryable.expressionBuilder.createProjection(aggregateFunc, alias),
    );

    return newQueryable;
  }
}

/**
 * Extension method to apply the Aggregation extensions to Queryable
 */
export function applyAggregationExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new AggregationExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.count = extensions.count.bind(extensions);
  queryable.sum = extensions.sum.bind(extensions);
  queryable.avg = extensions.avg.bind(extensions);
  queryable.min = extensions.min.bind(extensions);
  queryable.max = extensions.max.bind(extensions);
  queryable.applyAggregation = extensions.applyAggregation.bind(extensions);
}
