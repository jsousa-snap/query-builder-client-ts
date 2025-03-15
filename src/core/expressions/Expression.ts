/**
 * Em vez de fazer declarações adiantadas de classes que não implementam o método abstrato,
 * vamos definir interfaces para o visitante. Modifique o arquivo Expression.ts assim:
 */

/**
 * Base class for all expressions in the query builder.
 */
export abstract class Expression {
  /**
   * Accepts a visitor that will process this expression
   */
  abstract accept<T>(visitor: ExpressionVisitor<T>): T;
}

/**
 * Base visitor interface for expression tree traversal
 */
export interface ExpressionVisitor<T> {
  visitBinaryExpression(expr: BinaryExpression): T;
  visitUnaryExpression(expr: UnaryExpression): T;
  visitColumnExpression(expr: ColumnExpression): T;
  visitConstantExpression(expr: ConstantExpression): T;
  visitFunctionExpression(expr: FunctionExpression): T;
  visitSelectExpression(expr: SelectExpression): T;
  visitTableExpression(expr: TableExpression): T;
  visitJoinExpression(expr: JoinExpression): T;
  visitSubqueryExpression(expr: SubqueryExpression): T;
  visitProjectionExpression(expr: ProjectionExpression): T;
  visitParameter(expr: ParameterExpression): T;
}

/**
 * Enumeration for all expression types
 */
export enum ExpressionType {
  // Binary operators
  Add,
  Subtract,
  Multiply,
  Divide,
  Modulo,
  Equal,
  NotEqual,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  And,
  Or,

  // Unary operators
  Not,
  Negate,

  // Special expressions
  Column,
  Constant,
  Function,
  Parameter,
  Select,
  Table,
  Join,
  Subquery,
  Projection,
}

// Declarar interfaces em vez de classes vazias
export interface BinaryExpression extends Expression {
  getOperatorType(): ExpressionType;
  getLeft(): Expression;
  getRight(): Expression;
}

export interface UnaryExpression extends Expression {
  getOperatorType(): ExpressionType;
  getOperand(): Expression;
}

export interface ColumnExpression extends Expression {
  getColumnName(): string;
  getTableAlias(): string;
}

export interface ConstantExpression extends Expression {
  getValue(): any;
  getValueType(): string;
}

export interface FunctionExpression extends Expression {
  getFunctionName(): string;
  getArguments(): Expression[];
}

export interface SelectExpression extends Expression {
  getProjections(): ProjectionExpression[];
  getFromTable(): TableExpression;
  getJoins(): JoinExpression[];
  getWhereClause(): Expression | null;
  getGroupByColumns(): Expression[];
  getHavingClause(): Expression | null;
  getOrderByColumns(): OrderByExpression[];
  getLimitValue(): Expression | null;
  getOffsetValue(): Expression | null;
  getIsDistinct(): boolean;
}

export interface TableExpression extends Expression {
  getTableName(): string;
  getAlias(): string;
}

export interface JoinExpression extends Expression {
  getTargetTable(): TableExpression;
  getJoinCondition(): Expression;
  getJoinType(): any; // Tipo adequado a ser definido
}

export interface SubqueryExpression extends Expression {
  getQuery(): SelectExpression;
}

export interface ProjectionExpression extends Expression {
  getExpression(): Expression;
  getAlias(): string;
}

export interface ParameterExpression extends Expression {
  getName(): string;
  getParameterType(): string | null;
}

// Para compatibilidade com SelectExpression
export interface OrderByExpression {
  getColumn(): Expression;
  isAscending(): boolean;
}
