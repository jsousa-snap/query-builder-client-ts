import {
  Expression,
  IExpressionVisitor,
  IFunctionExpression as IFunctionExpression,
} from './Expression';

/**
 * Represents a SQL function call
 * Examples: COUNT(*), MAX(price), CONCAT(first_name, ' ', last_name)
 */
export class FunctionExpression extends Expression implements IFunctionExpression {
  constructor(
    private readonly functionName: string,
    private readonly args: Expression[],
  ) {
    super();
  }

  /**
   * Gets the function name
   */
  getFunctionName(): string {
    return this.functionName;
  }

  /**
   * Gets the function arguments
   */
  getArguments(): Expression[] {
    return this.args;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: IExpressionVisitor<T>): T {
    return visitor.visitFunctionExpression(this);
  }
}
