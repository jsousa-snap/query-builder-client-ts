import { Expression, ExpressionVisitor } from './Expression';

/**
 * Representa uma referência a uma coluna de uma tabela pai em uma subconsulta
 */
export class ParentColumnExpression extends Expression {
  /**
   * Cria uma nova expressão de coluna pai
   * @param tableAlias Alias da tabela pai
   * @param columnName Nome da coluna na tabela pai
   */
  constructor(
    private readonly tableAlias: string,
    private readonly columnName: string,
  ) {
    super();
  }

  /**
   * Obtém o alias da tabela pai
   */
  getTableAlias(): string {
    return this.tableAlias;
  }

  /**
   * Obtém o nome da coluna na tabela pai
   */
  getColumnName(): string {
    return this.columnName;
  }

  /**
   * Aceita um visitante
   */
  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitParentColumnExpression(this);
  }
}
