import { DbSet } from '../../context/DbSet';
import { Expression, ExpressionType } from '../../expressions/Expression';
import { BinaryExpression } from '../../expressions/BinaryExpression';
import { ColumnExpression } from '../../expressions/ColumnExpression';
import { LambdaParser } from '../LambdaParser';
import { Queryable } from '../Queryable';
import { PredicateFunction } from '../Types';
import { IQueryWhereExtensions } from './WhereExtensions';
import { ScalarSubqueryExpression } from '../../expressions/ScalarSubqueryExpression';

/**
 * Implementation of WHERE clause extensions
 */
export class WhereExtensions<T> implements IQueryWhereExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  where(predicate: PredicateFunction<T>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    try {
      // Create a lambda parser with property tracking information
      const enhancedParser = new LambdaParser(
        this.queryable.expressionBuilder,
        this.queryable.contextVariables,
        this.queryable.getPropertyTracker(),
      );

      // Attempt to parse with enhanced nested property support
      const predicateExpr = enhancedParser.parsePredicateWithNesting<T>(
        predicate,
        this.queryable.alias,
      );

      // If there's already a where clause, AND it with the new one
      if (newQueryable.whereClause) {
        newQueryable.whereClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.whereClause,
          predicateExpr,
        );
      } else {
        newQueryable.whereClause = predicateExpr;
      }
    } catch (err) {
      console.warn(
        'Error processing predicate with enhanced parser, falling back to standard method:',
        err,
      );

      // Fallback to standard parsing method
      const predicateExpr = this.queryable.lambdaParser.parsePredicate<T>(
        predicate,
        this.queryable.alias,
      );

      if (newQueryable.whereClause) {
        newQueryable.whereClause = this.queryable.expressionBuilder.createAnd(
          newQueryable.whereClause,
          predicateExpr,
        );
      } else {
        newQueryable.whereClause = predicateExpr;
      }
    }

    return newQueryable;
  }

  whereIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Extract the column name from the selector
    const selectorStr = selector.toString();
    const propertyInfo = this.queryable.resolvePropertyPath(selectorStr, this.queryable.alias);

    // Create column expression
    const column = this.queryable.expressionBuilder.createColumn(
      propertyInfo.columnName,
      propertyInfo.tableAlias,
    );

    // Convert the Queryable to a subquery
    const selectExpr = subquery.toMetadata();
    const subqueryExpr = this.queryable.expressionBuilder.createSubquery(selectExpr);

    // Create the IN expression
    const inExpr = this.queryable.expressionBuilder.createInSubquery(column, subqueryExpr);

    // If there's already a where clause, AND it with the new one
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.queryable.expressionBuilder.createAnd(
        newQueryable.whereClause,
        inExpr,
      );
    } else {
      newQueryable.whereClause = inExpr;
    }

    return newQueryable;
  }

  // Implement the remaining methods from the interface
  // Following the same pattern as above

  whereNotIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    // Similar implementation as whereIn but using NOT IN
    const newQueryable = this.queryable.clone();
    const selectorStr = selector.toString();
    const propertyInfo = this.queryable.resolvePropertyPath(selectorStr, this.queryable.alias);
    const column = this.queryable.expressionBuilder.createColumn(
      propertyInfo.columnName,
      propertyInfo.tableAlias,
    );
    const selectExpr = subquery.toMetadata();
    const subqueryExpr = this.queryable.expressionBuilder.createSubquery(selectExpr);
    const notInExpr = this.queryable.expressionBuilder.createNotInSubquery(column, subqueryExpr);

    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.queryable.expressionBuilder.createAnd(
        newQueryable.whereClause,
        notInExpr,
      );
    } else {
      newQueryable.whereClause = notInExpr;
    }

    return newQueryable;
  }

  // Continue implementing all the other methods...

  // For example:
  whereExists<U>(
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<any>,
  ): Queryable<T> {
    // Implementation based on the provided code
    const newQueryable = this.queryable.clone();
    const subquery = subquerySource.query();

    // Use the LambdaParser to correctly analyze the selectors
    const enhancedParser = new LambdaParser(
      this.queryable.expressionBuilder,
      this.queryable.contextVariables,
      this.queryable.getPropertyTracker(),
    );

    // Parse the parent query selector
    const parentColumn = enhancedParser.parseAggregationSelector<T>(
      parentSelector,
      this.queryable.alias,
    );

    // Parse the subquery selector
    const subqueryEnhancedParser = new LambdaParser(
      subquery.expressionBuilder,
      subquery.contextVariables,
      subquery.getPropertyTracker(),
    );

    const subqueryColumn = subqueryEnhancedParser.parseAggregationSelector<U>(
      subquerySelector,
      subquerySource.getAlias(),
    );

    // Create the correlation condition
    const equalityExpr = subquery.expressionBuilder.createEqual(subqueryColumn, parentColumn);

    // Assign directly to the whereClause property
    const initialSubquery = subquery.clone();
    if (initialSubquery.whereClause) {
      initialSubquery.whereClause = initialSubquery.expressionBuilder.createAnd(
        initialSubquery.whereClause,
        equalityExpr,
      );
    } else {
      initialSubquery.whereClause = equalityExpr;
    }

    // Apply additional transformations
    const transformedSubquery = subqueryBuilder(initialSubquery);

    // Ensure the subquery has a projection
    let finalSubquery = transformedSubquery;
    if (transformedSubquery.projections.length === 0) {
      finalSubquery = transformedSubquery.select(_ => 1);
    }

    // Convert the subquery to an expression
    const selectExpr = finalSubquery.toMetadata();
    const subqueryExpr = this.queryable.expressionBuilder.createSubquery(selectExpr);

    // Create the EXISTS expression
    const existsExpr = this.queryable.expressionBuilder.createExistsSubquery(subqueryExpr);

    // Add to the WHERE clause
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.queryable.expressionBuilder.createAnd(
        newQueryable.whereClause,
        existsExpr,
      );
    } else {
      newQueryable.whereClause = existsExpr;
    }

    return newQueryable;
  }

  // And so on for the remaining methods...
}

/**
 * Extension method to apply the WHERE extensions to Queryable
 */
export function applyWhereExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new WhereExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.where = extensions.where.bind(extensions);
  queryable.whereIn = extensions.whereIn.bind(extensions);
  queryable.whereNotIn = extensions.whereNotIn.bind(extensions);
  queryable.whereExists = extensions.whereExists.bind(extensions);
  queryable.whereNotExists = extensions.whereNotExists.bind(extensions);
  queryable.whereCompareSubquery = extensions.whereCompareSubquery.bind(extensions);
  queryable.whereEqual = extensions.whereEqual.bind(extensions);
  queryable.whereNotEqual = extensions.whereNotEqual.bind(extensions);
  queryable.whereGreaterThan = extensions.whereGreaterThan.bind(extensions);
  queryable.whereGreaterThanOrEqual = extensions.whereGreaterThanOrEqual.bind(extensions);
  queryable.whereLessThan = extensions.whereLessThan.bind(extensions);
  queryable.whereLessThanOrEqual = extensions.whereLessThanOrEqual.bind(extensions);
  queryable.whereInCorrelated = extensions.whereInCorrelated.bind(extensions);
  queryable.whereNotInCorrelated = extensions.whereNotInCorrelated.bind(extensions);
  queryable.whereEqualCorrelated = extensions.whereEqualCorrelated.bind(extensions);
  queryable.whereNotEqualCorrelated = extensions.whereNotEqualCorrelated.bind(extensions);
  queryable.whereGreaterThanCorrelated = extensions.whereGreaterThanCorrelated.bind(extensions);
  queryable.whereGreaterThanOrEqualCorrelated =
    extensions.whereGreaterThanOrEqualCorrelated.bind(extensions);
  queryable.whereLessThanCorrelated = extensions.whereLessThanCorrelated.bind(extensions);
  queryable.whereLessThanOrEqualCorrelated =
    extensions.whereLessThanOrEqualCorrelated.bind(extensions);
}
