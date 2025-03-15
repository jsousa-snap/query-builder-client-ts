import {
  Expression,
  ExpressionVisitor,
  ConstantExpression as IConstantExpression,
} from './Expression';

/**
 * Represents a constant value in a SQL expression
 * Examples: 42, 'hello', true, null
 */
export class ConstantExpression extends Expression implements IConstantExpression {
  private readonly type: string;

  constructor(private readonly value: any) {
    super();
    this.type = this.determineType(value);
  }

  /**
   * Determines the type of the constant value
   */
  private determineType(value: any): string {
    if (value === null) {
      return 'null';
    }
    if (typeof value === 'string') {
      return 'string';
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (value instanceof Date) {
      return 'date';
    }
    return 'unknown';
  }

  /**
   * Gets the constant value
   */
  getValue(): any {
    return this.value;
  }

  /**
   * Gets the constant type
   */
  getValueType(): string {
    return this.type;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitConstantExpression(this);
  }
}
