import {
  Expression,
  ExpressionType,
  ExpressionVisitor,
  BinaryExpression as IBinaryExpression,
} from './Expression';

/**
 * Represents a binary operation between two expressions
 * Examples: a = b, a > b, a + b, a AND b
 */
export class BinaryExpression extends Expression implements IBinaryExpression {
  constructor(
    private readonly type: ExpressionType,
    private readonly left: Expression,
    private readonly right: Expression,
  ) {
    super();
    this.validateOperatorType(type);
  }

  /**
   * Validates that the operator type is a binary operator
   */
  private validateOperatorType(type: ExpressionType): void {
    const validOperators = [
      ExpressionType.Add,
      ExpressionType.Subtract,
      ExpressionType.Multiply,
      ExpressionType.Divide,
      ExpressionType.Modulo,
      ExpressionType.Equal,
      ExpressionType.NotEqual,
      ExpressionType.GreaterThan,
      ExpressionType.GreaterThanOrEqual,
      ExpressionType.LessThan,
      ExpressionType.LessThanOrEqual,
      ExpressionType.And,
      ExpressionType.Or,
    ];

    if (!validOperators.includes(type)) {
      throw new Error(`Invalid binary operator type: ${ExpressionType[type]}`);
    }
  }

  /**
   * Gets the operator type
   */
  getOperatorType(): ExpressionType {
    return this.type;
  }

  /**
   * Gets the left operand
   */
  getLeft(): Expression {
    return this.left;
  }

  /**
   * Gets the right operand
   */
  getRight(): Expression {
    return this.right;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitBinaryExpression(this);
  }
}
