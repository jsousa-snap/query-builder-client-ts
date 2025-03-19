import { ExpressionSerializer } from '../../../utils/ExpressionSerializer';
import { Queryable } from '../Queryable';
import { IQueryExecutionExtensions } from './ExecutionExtensionsInterface';

/**
 * Implementation of execution extensions
 */
export class ExecutionExtensions<T> implements IQueryExecutionExtensions<T> {
  constructor(private queryable: Queryable<T>) {}

  async toListAsync(): Promise<Record<string, any>[]> {
    const metadata = ExpressionSerializer.serialize(this.queryable.toMetadata());
    return await this.queryable.provider.queryAsync(metadata);
  }

  async firstAsync(): Promise<Record<string, any> | null> {
    const metadata = ExpressionSerializer.serialize(this.queryable.toMetadata());
    return await this.queryable.provider.firstAsync(metadata);
  }
}

/**
 * Extension method to apply the Execution extensions to Queryable
 */
export function applyExecutionExtensions<T>(queryable: Queryable<T>): void {
  const extensions = new ExecutionExtensions(queryable);

  // Assign all methods from the extensions to the queryable
  queryable.toListAsync = extensions.toListAsync.bind(extensions);
  queryable.firstAsync = extensions.firstAsync.bind(extensions);
}
