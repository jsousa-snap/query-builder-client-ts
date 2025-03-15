import {
  Expression,
  ExpressionVisitor,
  SubqueryExpression as ISubqueryExpression,
  SelectExpression,
} from './Expression';

/**
 * Represents a subquery in a SQL expression
 * Example: (SELECT MAX(price) FROM products)
 */
export class SubqueryExpression extends Expression implements ISubqueryExpression {
  constructor(private readonly query: SelectExpression) {
    super();
  }

  /**
   * Gets the underlying query expression
   */
  getQuery(): SelectExpression {
    return this.query;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitSubqueryExpression(this);
  }
}
