import {
  Expression,
  ExpressionType,
  ExpressionVisitor,
  UnaryExpression as IUnaryExpression,
} from './Expression';

/**
 * Represents a unary operation on an expression
 * Examples: NOT condition, -value
 */
export class UnaryExpression extends Expression implements IUnaryExpression {
  constructor(
    private readonly type: ExpressionType,
    private readonly operand: Expression,
  ) {
    super();
    this.validateOperatorType(type);
  }

  /**
   * Validates that the operator type is a unary operator
   */
  private validateOperatorType(type: ExpressionType): void {
    const validOperators = [ExpressionType.Not, ExpressionType.Negate];

    if (!validOperators.includes(type)) {
      throw new Error(`Invalid unary operator type: ${ExpressionType[type]}`);
    }
  }

  /**
   * Gets the operator type
   */
  getOperatorType(): ExpressionType {
    return this.type;
  }

  /**
   * Gets the operand expression
   */
  getOperand(): Expression {
    return this.operand;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitUnaryExpression(this);
  }
}
