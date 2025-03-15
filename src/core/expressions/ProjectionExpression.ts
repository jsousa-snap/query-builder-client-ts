import {
  Expression,
  ExpressionVisitor,
  ProjectionExpression as IProjectionExpression,
} from './Expression';

/**
 * Represents a column or expression in a SQL SELECT list
 * Examples: users.name AS full_name, COUNT(*) AS total
 */
export class ProjectionExpression extends Expression implements IProjectionExpression {
  constructor(
    private readonly expression: Expression,
    private readonly alias: string,
  ) {
    super();
  }

  /**
   * Gets the source expression
   */
  getExpression(): Expression {
    return this.expression;
  }

  /**
   * Gets the alias for this projection
   */
  getAlias(): string {
    return this.alias;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitProjectionExpression(this);
  }
}
