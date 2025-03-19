import { Queryable } from '../Queryable';
import { IQueryPaginationExtensions } from './PaginationExtensionsInterface';

/**
 * Implementation of pagination extensions
 */
export class PaginationExtensions<T> implements IQueryPaginationExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  limit(count: number): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Set the limit value
    newQueryable.limitValue = this.queryable.expressionBuilder.createConstant(count);

    return newQueryable;
  }

  offset(offset: number): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.queryable.clone();

    // Set the offset value
    newQueryable.offsetValue = this.queryable.expressionBuilder.createConstant(offset);

    return newQueryable;
  }
}

/**
 * Extension method to apply the Pagination extensions to Queryable
 */
export function applyPaginationExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new PaginationExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.limit = extensions.limit.bind(extensions);
  queryable.offset = extensions.offset.bind(extensions);
}
