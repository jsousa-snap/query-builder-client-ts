import { DbSet } from '../../context/DbSet';
import { JoinType } from '../../expressions/JoinExpression';
import { PropertyTracker } from '../PropertyTracker';
import { Queryable } from '../Queryable';
import { JoinKeySelector, JoinResultSelector } from '../Types';
import { IQueryJoinExtensions } from './JoinExtensionsInterface';

/**
 * Implementation of JOIN clause extensions
 */
export class JoinExtensions<T> implements IQueryJoinExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  join<U = T, TResult = T>(
    target: DbSet<U>,
    sourceKeySelector: JoinKeySelector<T>,
    targetKeySelector: JoinKeySelector<U>,
    resultSelector: JoinResultSelector<T, U, TResult>,
    joinType: JoinType = JoinType.INNER,
  ): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.queryable.cloneWithNewType<TResult>();

    // Get target table information
    const targetTableName = target.getTableName();
    const targetAlias = target.getAlias();

    // Register the target table in the property tracker
    newQueryable.getPropertyTracker().registerTable(targetTableName, targetAlias);

    // Create the target table expression
    const targetTable = this.queryable.expressionBuilder.createTable(targetTableName, targetAlias);

    // Extract parameter names from the resultSelector function
    const resultSelectorStr = resultSelector.toString();
    const paramMatch = resultSelectorStr.match(/\(\s*(\w+)\s*,\s*(\w+)(?:\s*,\s*\w+)?\s*\)\s*=>/);
    const sourceParamName = paramMatch ? paramMatch[1] : 'source';
    const targetParamName = paramMatch ? paramMatch[2] : 'target';

    // Process the sourceKeySelector to understand the property's origin
    const sourceKeyInfo = this.processNestedJoinKey<T>(sourceKeySelector);

    // Parse the targetKeySelector to extract the property
    const targetSelectorStr = targetKeySelector.toString();
    const targetPropMatch = targetSelectorStr.match(/=>\s*\w+\.(\w+)/);
    const targetKeyInfo = {
      tableAlias: targetAlias,
      columnName: targetPropMatch && targetPropMatch[1] ? targetPropMatch[1] : 'id',
    };

    // Create the column expressions for the join
    const sourceColumn = this.queryable.expressionBuilder.createColumn(
      sourceKeyInfo.columnName,
      sourceKeyInfo.tableAlias,
    );
    const targetColumn = this.queryable.expressionBuilder.createColumn(
      targetKeyInfo.columnName,
      targetKeyInfo.tableAlias,
    );

    // Create the join condition
    const joinCondition = this.queryable.expressionBuilder.createEqual(sourceColumn, targetColumn);

    // Create the join expression
    const joinExpr = this.queryable.expressionBuilder.createJoin(
      targetTable,
      joinCondition,
      joinType,
    );

    // Add the join to the query
    newQueryable.joins.push(joinExpr);

    // Analyze the resultSelector to register properties in the tracker
    this.processResultSelectorForJoin(
      resultSelectorStr,
      sourceParamName,
      targetParamName,
      this.queryable.alias,
      targetAlias,
      newQueryable.getPropertyTracker(),
    );

    return newQueryable;
  }

  processNestedJoinKey<S>(sourceKeySelector: (entity: S) => any): {
    tableAlias: string;
    columnName: string;
  } {
    const selectorStr = sourceKeySelector.toString();

    // Check if we have a nested property of the type joined.order.id
    const nestedMatch = selectorStr.match(/=>\s*\w+\.(\w+)\.(\w+)/);
    if (nestedMatch && nestedMatch[1] && nestedMatch[2]) {
      const objectName = nestedMatch[1]; // "order"
      const propertyName = nestedMatch[2]; // "id"

      // Try to find the correct table for the nested object
      if (this.queryable.getPropertyTracker()) {
        // 1. Check if the object is directly registered
        const objectSource = this.queryable.getPropertyTracker().getPropertySource(objectName);
        if (objectSource) {
          return {
            tableAlias: objectSource.tableAlias,
            columnName: propertyName,
          };
        }

        // 2. Check wildcard registrations
        const wildcardKey = `${objectName}.*`;
        const wildcardSource = this.queryable.getPropertyTracker().getPropertySource(wildcardKey);
        if (wildcardSource) {
          return {
            tableAlias: wildcardSource.tableAlias,
            columnName: propertyName,
          };
        }

        // 3. Look in all previous joins to see if any resulted in an object with this name
        for (const [propName, source] of this.queryable
          .getPropertyTracker()
          .getAllPropertySources()
          .entries()) {
          if (
            propName === objectName ||
            (source.propertyPath && source.propertyPath[0] === objectName)
          ) {
            return {
              tableAlias: source.tableAlias,
              columnName: propertyName,
            };
          }
        }

        // 4. Check table alias match with object name
        for (const alias of this.queryable.getPropertyTracker().getTableAliases()) {
          // Exact match (order -> order) or initial (order -> o)
          if (alias === objectName || objectName.charAt(0).toLowerCase() === alias.toLowerCase()) {
            return {
              tableAlias: alias,
              columnName: propertyName,
            };
          }
        }
      }
    }

    // If not a nested property or we couldn't resolve it,
    // extract only the simple property entity.property
    const simplePropMatch = selectorStr.match(/=>\s*\w+\.(\w+)/);
    if (simplePropMatch && simplePropMatch[1]) {
      return {
        tableAlias: this.queryable.alias,
        columnName: simplePropMatch[1],
      };
    }

    // Fallback for unidentified cases
    return {
      tableAlias: this.queryable.alias,
      columnName: 'id',
    };
  }

  processResultSelectorForJoin(
    resultSelectorStr: string,
    sourceParamName: string,
    targetParamName: string,
    sourceTableAlias: string,
    targetTableAlias: string,
    propertyTracker: PropertyTracker,
  ): Map<string, { tableAlias: string; path: string[] }> {
    const resultMap = new Map<string, { tableAlias: string; path: string[] }>();

    try {
      // Extract the literal object returned by the resultSelector
      const objectLiteralMatch = resultSelectorStr.match(/\{([^}]*)\}/);

      if (objectLiteralMatch && objectLiteralMatch[1]) {
        const objectContent = objectLiteralMatch[1];

        // Look for property assignments
        const propAssignments = objectContent.split(',').map(s => s.trim());

        for (const assignment of propAssignments) {
          // Example: "user: user" or "order: order" or "userId: user.id" or "orderAmount: order.amount"
          if (assignment.includes(':')) {
            // Case with explicit assignment: prop: value
            const parts = assignment.split(':').map(s => s.trim());
            const propName = parts[0];
            const propValue = parts[1];

            // Check if it's a direct reference to a parameter
            if (propValue === sourceParamName) {
              // Case like "user: user" - reference to the complete object
              propertyTracker.registerProperty(propName, sourceTableAlias, '*', [propName]);
              // Register a wildcard to allow tracking nested properties
              propertyTracker.registerProperty(`${propName}.*`, sourceTableAlias, '*', [
                propName,
                '*',
              ]);
            } else if (propValue === targetParamName) {
              // Case like "order: order" - reference to the complete object
              propertyTracker.registerProperty(propName, targetTableAlias, '*', [propName]);
              // Similar to above, for tracking "joined.order.amount"
              propertyTracker.registerProperty(`${propName}.*`, targetTableAlias, '*', [
                propName,
                '*',
              ]);
            } else if (propValue.startsWith(`${sourceParamName}.`)) {
              // Case like "userId: user.id" or "order: joined.order"
              const fieldName = propValue.substring(sourceParamName.length + 1);
              propertyTracker.registerProperty(propName, sourceTableAlias, fieldName);
            } else if (propValue.startsWith(`${targetParamName}.`)) {
              // Case like "orderAmount: order.amount"
              const fieldName = propValue.substring(targetParamName.length + 1);
              propertyTracker.registerProperty(propName, targetTableAlias, fieldName);
            }
          } else if (assignment === sourceParamName) {
            // Shorthand for the source object (e.g., just "user")
            propertyTracker.registerProperty(sourceParamName, sourceTableAlias, '*', [
              sourceParamName,
            ]);
            propertyTracker.registerProperty(`${sourceParamName}.*`, sourceTableAlias, '*', [
              sourceParamName,
              '*',
            ]);
          } else if (assignment === targetParamName) {
            // Shorthand for the target object (e.g., just "order")
            propertyTracker.registerProperty(targetParamName, targetTableAlias, '*', [
              targetParamName,
            ]);
            propertyTracker.registerProperty(`${targetParamName}.*`, targetTableAlias, '*', [
              targetParamName,
              '*',
            ]);
          } else if (assignment.match(/^\w+$/)) {
            // Other shorthand property
            propertyTracker.registerProperty(assignment, targetTableAlias, assignment);
          }
          // Special case: spread operator ...joined
          else if (assignment.startsWith('...')) {
            const spreadParam = assignment.substring(3);

            // Iterate through properties already tracked belonging to the spreadParam object
            for (const [registeredPropertyName, propertySource] of propertyTracker
              .getAllPropertySources()
              .entries()) {
              if (registeredPropertyName.startsWith(`${spreadParam}.`)) {
                // Extract the property name without the spreadParam prefix
                const actualPropertyName = registeredPropertyName.substring(spreadParam.length + 1);

                // Register the property with its original source
                propertyTracker.registerProperty(
                  actualPropertyName,
                  propertySource.tableAlias,
                  propertySource.columnName,
                  propertySource.propertyPath,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error analyzing resultSelector:', error);
    }

    return resultMap;
  }
}

/**
 * Extension method to apply the Join extensions to Queryable
 */
export function applyJoinExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new JoinExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.join = extensions.join.bind(extensions);
  queryable.processNestedJoinKey = extensions.processNestedJoinKey.bind(extensions);
  queryable.processResultSelectorForJoin = extensions.processResultSelectorForJoin.bind(extensions);
}
