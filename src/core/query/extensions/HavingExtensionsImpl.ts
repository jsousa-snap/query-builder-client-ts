import { BinaryExpression } from '../../expressions/BinaryExpression';
import { ColumnExpression } from '../../expressions/ColumnExpression';
import { Expression, ExpressionType } from '../../expressions/Expression';
import { FunctionExpression } from '../../expressions/FunctionExpression';
import { ExpressionBuilder } from '../ExpressionBuilder';
import { LambdaParser } from '../LambdaParser';
import { Queryable } from '../Queryable';
import { AggregateSelector, PredicateFunction } from '../Types';
import { IQueryHavingExtensions } from './HavingExtensionsInterface';

/**
 * Implementation of HAVING clause extensions
 */
export class HavingExtensions<T> implements IQueryHavingExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  having(predicate: PredicateFunction<any>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the predicate string for pattern matching
    const predicateStr = predicate.toString();

    // Check for aggregate patterns like g.count > 5
    const aggregatePattern = /(\w+)\.(count|sum|avg|min|max)\s*([><=!]+)\s*(\d+)/i;
    const aggregateMatch = predicateStr.match(aggregatePattern);

    if (aggregateMatch) {
      // We found an aggregate comparison pattern
      const [_, paramName, aggFunction, operator, value] = aggregateMatch;

      // Map the operator string to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the appropriate function expression
      let aggExpr: Expression;
      switch (aggFunction.toUpperCase()) {
        case 'COUNT':
          aggExpr = this.queryable.expressionBuilder.createCount(null);
          break;
        case 'SUM':
          // Try to determine which column to sum based on projections
          const sumColumn = this.findColumnForAggregate('SUM');
          aggExpr = this.queryable.expressionBuilder.createSum(sumColumn);
          break;
        case 'AVG':
          const avgColumn = this.findColumnForAggregate('AVG');
          aggExpr = this.queryable.expressionBuilder.createAvg(avgColumn);
          break;
        case 'MIN':
          const minColumn = this.findColumnForAggregate('MIN');
          aggExpr = this.queryable.expressionBuilder.createMin(minColumn);
          break;
        case 'MAX':
          const maxColumn = this.findColumnForAggregate('MAX');
          aggExpr = this.queryable.expressionBuilder.createMax(maxColumn);
          break;
        default:
          throw new Error(`Unsupported aggregate function: ${aggFunction}`);
      }

      // Create a constant expression for the comparison value
      const valueConst = this.queryable.expressionBuilder.createConstant(Number(value));

      // Create the binary expression for the HAVING clause
      const havingExpr = this.queryable.expressionBuilder.createBinary(
        exprType,
        aggExpr,
        valueConst,
      );

      // Add to existing having clause or set as new having clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    // Check for direct column comparison patterns (g.age > 25)
    const columnPattern = /(\w+)\.(\w+)\s*([><=!]+)\s*(\d+)/i;
    const columnMatch = predicateStr.match(columnPattern);

    // Check if we're in a GROUP BY context
    const hasGroupBy = this.queryable.groupByColumns.length > 0;

    if (hasGroupBy && columnMatch) {
      // We found a simple column comparison pattern in a GROUP BY context
      const [_, paramName, columnName, operator, value] = columnMatch;

      // Map the operator string to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Find the column in group by or projections
      let tableAlias = this.queryable.alias;
      let foundInGroupBy = false;

      // Check if this column is in GROUP BY
      for (const groupByCol of this.queryable.groupByColumns) {
        if (groupByCol instanceof ColumnExpression && groupByCol.getColumnName() === columnName) {
          tableAlias = groupByCol.getTableAlias();
          foundInGroupBy = true;
          break;
        }
      }

      // If not in GROUP BY, check projections
      if (!foundInGroupBy) {
        for (const projection of this.queryable.projections) {
          if (
            projection.getAlias() === columnName &&
            projection.getExpression() instanceof ColumnExpression
          ) {
            const expr = projection.getExpression() as ColumnExpression;
            tableAlias = expr.getTableAlias();
            break;
          }
        }
      }

      // Create the column expression
      const column = this.queryable.expressionBuilder.createColumn(columnName, tableAlias);

      // If the column is not in GROUP BY, wrap it in an aggregate function
      let havingLeftExpr: Expression;
      if (foundInGroupBy) {
        havingLeftExpr = column;
      } else {
        // Determine which aggregate function to use based on context
        // Default to AVG as it's a common choice
        havingLeftExpr = this.queryable.expressionBuilder.createAvg(column);
      }

      // Create the value expression
      const valueExpr = this.queryable.expressionBuilder.createConstant(Number(value));

      // Create the complete comparison expression
      const havingExpr = this.queryable.expressionBuilder.createBinary(
        exprType,
        havingLeftExpr,
        valueExpr,
      );

      // Add to existing having clause or set as new having clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    // If not a recognized pattern, try normal parsing
    try {
      // Create a lambda parser with property tracking information
      const enhancedParser = new LambdaParser(
        this.queryable.expressionBuilder,
        this.queryable.contextVariables,
        this.queryable.getPropertyTracker(),
      );

      // Attempt to parse with enhanced support
      const predicateExpr = enhancedParser.parsePredicateWithNesting<T>(
        predicate,
        this.queryable.alias,
      );

      // If we're in a GROUP BY context, we need to transform non-aggregated expressions
      let havingExpr = predicateExpr;
      if (hasGroupBy && predicateExpr instanceof BinaryExpression) {
        // Check if the left side is a column expression
        const left = predicateExpr.getLeft();
        const right = predicateExpr.getRight();

        if (left instanceof ColumnExpression) {
          const columnName = left.getColumnName();
          const tableAlias = left.getTableAlias();

          // Check if this column is part of GROUP BY
          let isGroupByColumn = false;
          for (const groupByCol of this.queryable.groupByColumns) {
            if (
              groupByCol instanceof ColumnExpression &&
              groupByCol.getColumnName() === columnName &&
              groupByCol.getTableAlias() === tableAlias
            ) {
              isGroupByColumn = true;
              break;
            }
          }

          // If not in GROUP BY, wrap in an aggregate function
          if (!isGroupByColumn) {
            // Use AVG as default aggregate function
            const avgExpr = this.queryable.expressionBuilder.createAvg(left);
            havingExpr = this.queryable.expressionBuilder.createBinary(
              predicateExpr.getOperatorType(),
              avgExpr,
              right,
            );
          }
        }
      }

      // If there's already a having clause, AND it with the new one
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }
    } catch (err) {
      console.warn(
        'Error processing having predicate with enhanced parser, falling back to standard method:',
        err,
      );

      // Fallback to standard parsing method
      const predicateExpr = this.queryable.lambdaParser.parsePredicate<any>(
        predicate,
        this.queryable.alias,
      );

      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          predicateExpr,
        );
      } else {
        newQueryable.havingClause = predicateExpr;
      }
    }

    return newQueryable;
  }

  havingCount(predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the comparison operator and value from the predicate string
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create COUNT(*) expression
      const countExpr = this.queryable.expressionBuilder.createCount(null);

      // Create the value constant
      const valueExpr = this.queryable.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.queryable.expressionBuilder.createBinary(
        exprType,
        countExpr,
        valueExpr,
      );

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse COUNT predicate: ${predicateStr}`);
  }

  havingAvg(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from AVG selector: ${selectorStr}`);
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

    // Create the AVG function
    const avgExpr = this.queryable.expressionBuilder.createAvg(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.queryable.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.queryable.expressionBuilder.createBinary(
        exprType,
        avgExpr,
        valueExpr,
      );

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse AVG predicate: ${predicateStr}`);
  }

  havingSum(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from SUM selector: ${selectorStr}`);
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

    // Create the SUM function
    const sumExpr = this.queryable.expressionBuilder.createSum(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.queryable.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.queryable.expressionBuilder.createBinary(
        exprType,
        sumExpr,
        valueExpr,
      );

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse SUM predicate: ${predicateStr}`);
  }

  havingMin(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from MIN selector: ${selectorStr}`);
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

    // Create the MIN function
    const minExpr = this.queryable.expressionBuilder.createMin(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.queryable.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.queryable.expressionBuilder.createBinary(
        exprType,
        minExpr,
        valueExpr,
      );

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse MIN predicate: ${predicateStr}`);
  }

  havingMax(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from MAX selector: ${selectorStr}`);
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

    // Create the MAX function
    const maxExpr = this.queryable.expressionBuilder.createMax(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.queryable.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.queryable.expressionBuilder.createBinary(
        exprType,
        maxExpr,
        valueExpr,
      );

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse MAX predicate: ${predicateStr}`);
  }

  findColumnForAggregate(aggregateType: string): Expression {
    // First check if we have this aggregate in projections
    for (const projection of this.queryable.projections) {
      const expr = projection.getExpression();

      if (expr instanceof FunctionExpression && expr.getFunctionName() === aggregateType) {
        // Return the first argument of the function
        const args = expr.getArguments();
        if (args.length > 0) {
          return args[0];
        }
      }
    }

    // If we don't have a matching projection, try to infer from context
    // For example, if we're doing SUM and have a "total" column, use that
    if (this.queryable.groupByColumns.length > 0) {
      // Default to using the first non-GROUP BY column
      for (const projection of this.queryable.projections) {
        const expr = projection.getExpression();

        if (expr instanceof ColumnExpression) {
          // Check if this column is NOT in the GROUP BY
          const isInGroupBy = this.queryable.groupByColumns.some(groupCol => {
            if (groupCol instanceof ColumnExpression) {
              return (
                groupCol.getTableAlias() === expr.getTableAlias() &&
                groupCol.getColumnName() === expr.getColumnName()
              );
            }
            return false;
          });

          if (!isInGroupBy) {
            return expr;
          }
        }
      }
    }

    // Last resort: use a wildcard (*)
    return this.queryable.expressionBuilder.createConstant('*');
  }
}

/**
 * Extension method to apply the Having extensions to Queryable
 */
export function applyHavingExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new HavingExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.having = extensions.having.bind(extensions);
  queryable.havingCount = extensions.havingCount.bind(extensions);
  queryable.havingAvg = extensions.havingAvg.bind(extensions);
  queryable.havingSum = extensions.havingSum.bind(extensions);
  queryable.havingMin = extensions.havingMin.bind(extensions);
  queryable.havingMax = extensions.havingMax.bind(extensions);
  queryable.findColumnForAggregate = extensions.findColumnForAggregate.bind(extensions);
}
