import { Expression, ExpressionVisitor, ColumnExpression as IColumnExpression } from './Expression';

/**
 * Represents a reference to a column in a table
 * Example: users.name, product.price
 */
export class ColumnExpression extends Expression implements IColumnExpression {
  constructor(
    private readonly columnName: string,
    private readonly tableAlias: string,
  ) {
    super();
  }

  /**
   * Gets the column name
   */
  getColumnName(): string {
    return this.columnName;
  }

  /**
   * Gets the table alias
   */
  getTableAlias(): string {
    return this.tableAlias;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitColumnExpression(this);
  }
}
