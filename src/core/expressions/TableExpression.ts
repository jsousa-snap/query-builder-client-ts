import { Expression, ExpressionVisitor, TableExpression as ITableExpression } from './Expression';

/**
 * Represents a table in a SQL FROM clause
 */
export class TableExpression extends Expression implements ITableExpression {
  constructor(
    private readonly tableName: string,
    private readonly alias: string,
  ) {
    super();
  }

  /**
   * Gets the table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Gets the table alias
   */
  getAlias(): string {
    return this.alias;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitTableExpression(this);
  }
}
