import {
  Expression,
  IExpressionVisitor,
  IParameterExpression as IParameterExpression,
} from './Expression';

/**
 * Represents a parameter in a SQL query
 * This is useful for prepared statements and parameterized queries
 * Example: @userId, :email
 */
export class ParameterExpression extends Expression implements IParameterExpression {
  constructor(
    private readonly name: string,
    private readonly paramType: string | null = null,
  ) {
    super();
  }

  /**
   * Gets the parameter name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Gets the parameter type (if specified)
   */
  getParameterType(): string | null {
    return this.paramType;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: IExpressionVisitor<T>): T {
    return visitor.visitParameterExpression(this);
  }
}
