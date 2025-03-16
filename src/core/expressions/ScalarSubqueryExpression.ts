import {
  Expression,
  IExpressionVisitor,
  IScalarSubqueryExpression,
  ISelectExpression,
} from './Expression';

export class ScalarSubqueryExpression extends Expression implements IScalarSubqueryExpression {
  constructor(private readonly subquery: ISelectExpression) {
    super();
  }

  /**
   * Gets the underlying query expression
   */
  getQuery(): ISelectExpression {
    return this.subquery;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: IExpressionVisitor<T>): T {
    return visitor.visitScalarSubqueryExpression(this);
  }
}
