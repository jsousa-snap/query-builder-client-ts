import { LambdaParser } from '../LambdaParser';
import { Queryable } from '../Queryable';
import { GroupBySelector } from '../Types';
import { IQueryGroupByExtensions } from './GroupByExtensionsInterface';

/**
 * Implementation of GROUP BY clause extensions
 */
export class GroupByExtensions<T> implements IQueryGroupByExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  groupBy(selector: GroupBySelector<T>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Get the selector function string
    const selectorStr = selector.toString();

    // Try to detect if it's returning an array
    const isArraySelector = selectorStr.includes('[') && selectorStr.includes(']');

    if (isArraySelector) {
      // Parse the array contents - this is a more complex case
      // Look for patterns like [entity.prop1, entity.prop2] or [entity.obj.prop1, entity.prop2]
      const properties = this.queryable.extractPropertiesFromArray(selectorStr);

      for (const prop of properties) {
        if (prop.isNested) {
          // Handle nested property
          // Try to find the correct table alias
          let tableAlias = this.queryable.alias;
          const objectName = prop.objectName;
          const propertyName = prop.propertyName;

          if (this.queryable.getPropertyTracker()) {
            // Try to resolve the table alias using the same strategies as in other methods
            const objectSource = this.queryable.getPropertyTracker().getPropertySource(objectName!);
            if (objectSource) {
              tableAlias = objectSource.tableAlias;
            } else {
              // Check wildcards
              const wildcardSource = this.queryable
                .getPropertyTracker()
                .getPropertySource(`${objectName}.*`);
              if (wildcardSource) {
                tableAlias = wildcardSource.tableAlias;
              } else {
                // Check table aliases
                for (const alias of this.queryable.getPropertyTracker().getTableAliases()) {
                  if (
                    alias === objectName ||
                    (objectName && objectName.length > 0 && alias === objectName[0].toLowerCase())
                  ) {
                    tableAlias = alias;
                    break;
                  }
                }
              }
            }
          }

          // Create and add the column expression
          const column = this.queryable.expressionBuilder.createColumn(propertyName, tableAlias);
          newQueryable.groupByColumns.push(column);
        } else {
          // Handle simple property
          const column = this.queryable.expressionBuilder.createColumn(
            prop.propertyName,
            this.queryable.alias,
          );
          newQueryable.groupByColumns.push(column);
        }
      }
    } else {
      // Single property selector
      const enhancedParser = new LambdaParser(
        this.queryable.expressionBuilder,
        this.queryable.contextVariables,
        this.queryable.getPropertyTracker(),
      );

      // Parse the selector with support for nested properties
      const column = enhancedParser.parseAggregationSelector<T>(
        selector as any,
        this.queryable.alias,
      );
      newQueryable.groupByColumns.push(column);
    }

    return newQueryable;
  }
}

/**
 * Extension method to apply the GroupBy extensions to Queryable
 */
export function applyGroupByExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new GroupByExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.groupBy = extensions.groupBy.bind(extensions);
}
