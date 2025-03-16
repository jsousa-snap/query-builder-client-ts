import { Expression, IExpressionVisitor, IFragmentExpression } from './Expression';

export class FragmentExpression extends Expression implements IFragmentExpression {
  constructor(private readonly value: string) {
    super();
  }
  getValue(): string {
    return this.value;
  }

  accept<T>(visitor: IExpressionVisitor<T>): T {
    return visitor.visitFragmentExpression(this);
  }
}
