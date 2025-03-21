import { DbSet } from '../../context/DbSet';
import { ColumnExpression } from '../../expressions/ColumnExpression';
import { FunctionExpression } from '../../expressions/FunctionExpression';
import { ScalarSubqueryExpression } from '../../expressions/ScalarSubqueryExpression';
import { LambdaParser } from '../LambdaParser';
import { Queryable } from '../Queryable';
import { SelectorFunction } from '../Types';
import { IQuerySelectExtensions } from './SelectExtensionsInterface';

/**
 * Implementation of SELECT clause extensions
 */
export class SelectExtensions<T> implements IQuerySelectExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult> {
    // Save existing projections that are subqueries
    const existingSubqueries = this.queryable.projections.filter(p => {
      const expr = p.getExpression();
      try {
        return expr instanceof ScalarSubqueryExpression;
      } catch {
        return false;
      }
    });

    // Create a new queryable with the new result type
    const newQueryable = this.queryable.cloneWithNewType<TResult>();

    try {
      // Create a LambdaParser with property tracking
      const lambdaParser = new LambdaParser(
        this.queryable.expressionBuilder,
        this.queryable.contextVariables,
        this.queryable.getPropertyTracker(),
      );

      // Parse the lambda function string to AST
      const selectorStr = selector.toString();
      const node = lambdaParser.parseLambda(selectorStr);

      // Check if the selector is a simple expression (not an object literal)
      if (!lambdaParser.isObjectLiteral(node)) {
        // It's a simple expression (user => user.id or _ => 1)
        const expression = lambdaParser.processSimpleExpression(node, this.queryable.alias);

        if (expression instanceof FunctionExpression) {
          const args = expression.getArguments();
          const columnArg = args.find(arg => arg instanceof ColumnExpression) as ColumnExpression;
          if (columnArg) {
            newQueryable.projections = [
              this.queryable.expressionBuilder.createProjection(
                expression,
                columnArg.getColumnName(),
              ),
            ];
          } else {
            newQueryable.projections = [
              this.queryable.expressionBuilder.createProjection(expression, null),
            ];
          }
        } else {
          newQueryable.projections = [
            this.queryable.expressionBuilder.createProjection(expression, null),
          ];
        }

        // If it's a column access, register in the tracker
        if (expression instanceof ColumnExpression) {
          newQueryable
            .getPropertyTracker()
            .registerProperty('value', expression.getTableAlias(), expression.getColumnName());
        }

        // Add existing subqueries back
        newQueryable.projections.push(...existingSubqueries);

        return newQueryable;
      }

      // Main approach: use the enhanced LambdaParser for object literals
      const propertyMappings = lambdaParser.parseSelectorEnhanced<T, TResult>(
        selector,
        this.queryable.alias,
      );

      // Convert the mappings to projection expressions
      newQueryable.projections = [];

      for (const [propertyName, mapping] of propertyMappings.entries()) {
        // Check if the expression is a ColumnExpression
        if (mapping.expression instanceof ColumnExpression) {
          const columnName = mapping.columnName || mapping.expression.getColumnName();
          let tableAlias = mapping.tableAlias || mapping.expression.getTableAlias();

          // Check if there's a nested property path (e.g., joined.order.amount)
          if (mapping.propertyPath && mapping.propertyPath.length > 1) {
            // Try to find the correct table for this nested property
            const source = this.queryable.resolveNestedPropertySource(mapping.propertyPath);

            if (source) {
              tableAlias = source.tableAlias;
            }
          }

          // Create a new column expression with the correct alias
          const columnExpr = this.queryable.expressionBuilder.createColumn(columnName, tableAlias);

          // Create the projection for this property
          const projectionExpr = this.queryable.expressionBuilder.createProjection(
            columnExpr,
            propertyName,
          );

          // Add to the list of projections
          newQueryable.projections.push(projectionExpr);

          // Register the property in the tracker
          newQueryable.getPropertyTracker().registerProperty(propertyName, tableAlias, columnName);
        } else {
          // For expressions that are not simple column accesses (e.g., calculations, functions)
          const projectionExpr = this.queryable.expressionBuilder.createProjection(
            mapping.expression,
            propertyName,
          );
          newQueryable.projections.push(projectionExpr);

          // Register as complex expression
          if (mapping.tableAlias) {
            newQueryable
              .getPropertyTracker()
              .registerProperty(
                propertyName,
                mapping.tableAlias,
                mapping.columnName || 'expression',
              );
          }
        }
      }
    } catch (error) {
      console.warn('Error in advanced selector parsing, using default method:', error);
    }

    // Add existing subqueries back
    newQueryable.projections.push(...existingSubqueries);

    return newQueryable;
  }

  withSubquery<U, TResult>(
    propertyName: string,
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<TResult>,
  ): Queryable<T & Record<string, TResult>> {
    // Create a clone of this queryable
    const newQueryable = this.queryable.clone();

    // Parse the selector for the subquery column
    const subquerySelectorStr = subquerySelector.toString();
    const subPropMatch = subquerySelectorStr.match(/=>.*?\.(\w+)/);
    const subqueryColumn = subPropMatch ? subPropMatch[1] : 'id';

    // Parse the parent selector to get the property name
    const parentSelectorStr = parentSelector.toString();

    // Define default values
    let parentTableAlias = this.queryable.alias;
    let parentColumn = 'id';

    // Check if we're after a select()
    const afterSelect = this.queryable.projections.length > 0;

    // Extract the parent property name
    const propMatch = parentSelectorStr.match(/=>.*?(?:\w+\.)?(\w+)/);
    if (propMatch && propMatch[1]) {
      const propName = propMatch[1];

      if (afterSelect) {
        // Look for the property in the projections list
        for (const projection of this.queryable.projections) {
          if (projection.getAlias() === propName) {
            // We found the projection - check if it's a column expression
            const expr = projection.getExpression();

            // For column expressions, extract the alias and column name
            if (expr.accept) {
              try {
                // Try to check if it's a ColumnExpression
                if (expr instanceof ColumnExpression) {
                  parentTableAlias = expr.getTableAlias();
                  parentColumn = expr.getColumnName();
                  break;
                }
              } catch {
                // If can't verify directly, try a more generic method
                const str = String(expr);
                if (str.includes('Column')) {
                  // Try to extract with regex
                  const tableMatch = str.match(/tableAlias:\s*['"]([^'"]+)['"]/);
                  const colMatch = str.match(/columnName:\s*['"]([^'"]+)['"]/);

                  if (tableMatch && colMatch) {
                    parentTableAlias = tableMatch[1];
                    parentColumn = colMatch[1];
                    break;
                  }
                }
              }
            }
          }
        }
      } else {
        // Before select, check if it's a nested property
        const nestedMatch = parentSelectorStr.match(/=>.*?(\w+)\.(\w+)\.(\w+)/);
        if (nestedMatch) {
          // Case: joined.post.id
          const objectName = nestedMatch[2]; // Ex: "post"
          parentColumn = nestedMatch[3]; // Ex: "id"

          // Look in joins
          for (const join of this.queryable.joins) {
            const targetTable = join.getTargetTable();
            const targetName = targetTable.getTableName();
            const targetAlias = targetTable.getAlias();

            if (
              targetName.toLowerCase().includes(objectName.toLowerCase()) ||
              targetAlias === objectName.toLowerCase().charAt(0)
            ) {
              parentTableAlias = targetAlias;
              break;
            }
          }
        } else {
          // Simple case: entity.id
          const simpleMatch = parentSelectorStr.match(/=>.*?(?:(\w+)\.)?(\w+)/);
          if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
            // Case: object.property
            const objectName = simpleMatch[1];
            parentColumn = simpleMatch[2];

            // Look in joins
            for (const join of this.queryable.joins) {
              const targetTable = join.getTargetTable();
              const targetName = targetTable.getTableName();
              const targetAlias = targetTable.getAlias();

              if (
                targetName.toLowerCase().includes(objectName.toLowerCase()) ||
                targetAlias === objectName.toLowerCase().charAt(0)
              ) {
                parentTableAlias = targetAlias;
                break;
              }
            }
          }
        }
      }
    }

    // Build the base query
    const subquery = subquerySource.query();

    // Create the correlation condition
    const parentColumnExpr = this.queryable.expressionBuilder.createColumn(
      parentColumn,
      parentTableAlias,
    );
    const subColumnExpr = subquery.expressionBuilder.createColumn(
      subqueryColumn,
      subquerySource.getAlias(),
    );
    const equalityExpr = subquery.expressionBuilder.createEqual(subColumnExpr, parentColumnExpr);

    // Add the condition to the subquery
    subquery.whereClause = equalityExpr;

    // Apply any additional transformation (such as count, etc)
    const transformedSubquery = subqueryBuilder(subquery);

    // Create the subquery expression
    const subqueryExpr = this.queryable.expressionBuilder.createSubquery(
      transformedSubquery.toMetadata(),
    );

    // Create the projection expression
    const projectionExpr = this.queryable.expressionBuilder.createProjection(
      subqueryExpr,
      propertyName,
    );

    // Add to the list of projections
    newQueryable.projections.push(projectionExpr);

    return newQueryable as any;
  }
}

/**
 * Extension method to apply the Select extensions to Queryable
 */
export function applySelectExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new SelectExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.select = extensions.select.bind(extensions);
  queryable.withSubquery = extensions.withSubquery.bind(extensions);
}
