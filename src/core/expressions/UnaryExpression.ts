import {
  Expression,
  ExpressionType,
  IExpressionVisitor,
  IUnaryExpression as IUnaryExpression,
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
    const validOperators = [
      ExpressionType.Not,
      ExpressionType.Negate,
      ExpressionType.Exists, // Novo operador para subconsultas
      ExpressionType.NotExists, // Novo operador para subconsultas
    ];

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
  accept<T>(visitor: IExpressionVisitor<T>): T {
    return visitor.visitUnaryExpression(this);
  }
}
