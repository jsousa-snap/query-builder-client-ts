import { Expression, ExpressionVisitor } from './Expression';

export class ParentColumnRef extends Expression {
  constructor(
    private readonly tableAlias: string,
    private readonly columnName: string,
  ) {
    super();
  }

  getTableAlias(): string {
    return this.tableAlias;
  }

  getColumnName(): string {
    return this.columnName;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    // Podemos usar visitColumnExpression existente para simplificar
    return visitor.visitColumnExpression({
      getColumnName: () => this.columnName,
      getTableAlias: () => this.tableAlias,
      accept: <T>(v: ExpressionVisitor<T>) => v.visitColumnExpression(this as any),
    });
  }
}
