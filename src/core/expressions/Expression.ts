/**
 * Em vez de fazer declarações adiantadas de classes que não implementam o método abstrato,
 * vamos definir interfaces para o visitante. Modifique o arquivo Expression.ts assim:
 */

import { FragmentExpression } from './FragmentExpression';
import { ParentColumnExpression } from './ParentColumnExpression';

/**
 * Base class for all expressions in the query builder.
 */
export abstract class Expression {
  /**
   * Accepts a visitor that will process this expression
   */
  abstract accept<T>(visitor: IExpressionVisitor<T>): T;
}

/**
 * Base visitor interface for expression tree traversal
 */
export interface IExpressionVisitor<T> {
  visitBinaryExpression(expr: IBinaryExpression): T;
  visitUnaryExpression(expr: IUnaryExpression): T;
  visitColumnExpression(expr: IColumnExpression): T;
  visitConstantExpression(expr: IConstantExpression): T;
  visitFunctionExpression(expr: IFunctionExpression): T;
  visitSelectExpression(expr: ISelectExpression): T;
  visitTableExpression(expr: ITableExpression): T;
  visitJoinExpression(expr: IJoinExpression): T;
  visitScalarSubqueryExpression(expr: IScalarSubqueryExpression): T;
  visitProjectionExpression(expr: IProjectionExpression): T;
  visitParameterExpression(expr: IParameterExpression): T;
  visitParentColumnExpression(expr: IParentColumnExpression): T;
  visitFragmentExpression(expr: IFragmentExpression): T;
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

  // Operadores adicionais para subconsultas
  In,
  NotIn,
  Exists,
  NotExists,
}

export interface IParentColumnExpression extends Expression {
  getTableAlias(): string;
  getColumnName(): string;
}

export interface IFragmentExpression extends Expression {
  getValue(): string;
}

export interface IBinaryExpression extends Expression {
  getOperatorType(): ExpressionType;
  getLeft(): Expression;
  getRight(): Expression;
}

export interface IUnaryExpression extends Expression {
  getOperatorType(): ExpressionType;
  getOperand(): Expression;
}

export interface IColumnExpression extends Expression {
  getColumnName(): string;
  getTableAlias(): string;
}

export interface IConstantExpression extends Expression {
  getValue(): any;
  getValueType(): string;
}

export interface IFunctionExpression extends Expression {
  getFunctionName(): string;
  getArguments(): Expression[];
}

export interface ISelectExpression extends Expression {
  getProjections(): IProjectionExpression[];
  getFromTable(): ITableExpression;
  getJoins(): IJoinExpression[];
  getWhereClause(): Expression | null;
  getGroupByColumns(): Expression[];
  getHavingClause(): Expression | null;
  getOrderByColumns(): IOrderingExpression[];
  getLimitValue(): Expression | null;
  getOffsetValue(): Expression | null;
  getIsDistinct(): boolean;
}

export interface ITableExpression extends Expression {
  getTableName(): string;
  getAlias(): string;
}

export interface IJoinExpression extends Expression {
  getTargetTable(): ITableExpression;
  getJoinCondition(): Expression;
  getJoinType(): any; // Tipo adequado a ser definido
}

export interface IScalarSubqueryExpression extends Expression {
  getQuery(): ISelectExpression;
}

export interface IProjectionExpression extends Expression {
  getExpression(): Expression;
  getAlias(): string;
}

export interface IParameterExpression extends Expression {
  getName(): string;
  getParameterType(): string | null;
}

// Para compatibilidade com SelectExpression
export interface IOrderingExpression {
  getColumn(): Expression;
  isAscending(): boolean;
}
