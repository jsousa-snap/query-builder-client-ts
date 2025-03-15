import { Expression, ExpressionType } from '../expressions/Expression';
import { BinaryExpression } from '../expressions/BinaryExpression';
import { UnaryExpression } from '../expressions/UnaryExpression';
import { ColumnExpression } from '../expressions/ColumnExpression';
import { ConstantExpression } from '../expressions/ConstantExpression';
import { FunctionExpression } from '../expressions/FunctionExpression';
import { SelectExpression, OrderByExpression } from '../expressions/SelectExpression';
import { TableExpression } from '../expressions/TableExpression';
import { JoinExpression, JoinType } from '../expressions/JoinExpression';
import { SubqueryExpression } from '../expressions/SubqueryExpression';
import { ProjectionExpression } from '../expressions/ProjectionExpression';
import { ParameterExpression } from '../expressions/ParameterExpression';
import { OrderDirection } from './Types';

/**
 * Builds expression trees for SQL queries
 * This class provides methods to construct expressions for different parts of a SQL query
 */
export class ExpressionBuilder {
  /**
   * Creates a table expression
   */
  createTable(tableName: string, alias: string): TableExpression {
    return new TableExpression(tableName, alias);
  }

  /**
   * Creates a column expression
   */
  createColumn(columnName: string, tableAlias: string): ColumnExpression {
    return new ColumnExpression(columnName, tableAlias);
  }

  /**
   * Creates a constant expression
   */
  createConstant(value: any): ConstantExpression {
    return new ConstantExpression(value);
  }

  /**
   * Creates a function expression
   */
  createFunction(name: string, args: Expression[]): FunctionExpression {
    return new FunctionExpression(name, args);
  }

  /**
   * Creates a parameter expression
   */
  createParameter(name: string, type?: string): ParameterExpression {
    return new ParameterExpression(name, type);
  }

  /**
   * Creates a binary expression
   */
  createBinary(type: ExpressionType, left: Expression, right: Expression): BinaryExpression {
    return new BinaryExpression(type, left, right);
  }

  /**
   * Creates a unary expression
   */
  createUnary(type: ExpressionType, operand: Expression): UnaryExpression {
    return new UnaryExpression(type, operand);
  }

  /**
   * Creates a projection expression
   */
  createProjection(expression: Expression, alias: string): ProjectionExpression {
    return new ProjectionExpression(expression, alias);
  }

  /**
   * Creates a join expression
   */
  createJoin(
    targetTable: TableExpression,
    condition: Expression,
    joinType: JoinType,
  ): JoinExpression {
    return new JoinExpression(targetTable, condition, joinType);
  }

  /**
   * Creates a subquery expression
   */
  createSubquery(query: SelectExpression): SubqueryExpression {
    return new SubqueryExpression(query);
  }

  /**
   * Creates an ORDER BY expression
   */
  createOrderBy(column: Expression, ascending: boolean): OrderByExpression {
    return new OrderByExpression(column, ascending);
  }

  /**
   * Creates a SELECT expression
   */
  createSelect(
    projections: ProjectionExpression[],
    fromTable: TableExpression,
    joins: JoinExpression[] = [],
    whereClause: Expression | null = null,
    groupByColumns: Expression[] = [],
    havingClause: Expression | null = null,
    orderByColumns: OrderByExpression[] = [],
    limitValue: Expression | null = null,
    offsetValue: Expression | null = null,
    isDistinct: boolean = false,
  ): SelectExpression {
    return new SelectExpression(
      projections,
      fromTable,
      joins,
      whereClause,
      groupByColumns,
      havingClause,
      orderByColumns,
      limitValue,
      offsetValue,
      isDistinct,
    );
  }

  /**
   * Creates a COUNT function expression
   */
  createCount(expression: Expression | null = null): FunctionExpression {
    // If no expression is provided, use COUNT(*)
    if (!expression) {
      expression = this.createConstant('*');
    }
    return this.createFunction('COUNT', [expression]);
  }

  /**
   * Creates a SUM function expression
   */
  createSum(expression: Expression): FunctionExpression {
    return this.createFunction('SUM', [expression]);
  }

  /**
   * Creates an AVG function expression
   */
  createAvg(expression: Expression): FunctionExpression {
    return this.createFunction('AVG', [expression]);
  }

  /**
   * Creates a MIN function expression
   */
  createMin(expression: Expression): FunctionExpression {
    return this.createFunction('MIN', [expression]);
  }

  /**
   * Creates a MAX function expression
   */
  createMax(expression: Expression): FunctionExpression {
    return this.createFunction('MAX', [expression]);
  }

  /**
   * Creates an equals comparison expression
   */
  createEqual(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.Equal, left, right);
  }

  /**
   * Creates a not equals comparison expression
   */
  createNotEqual(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.NotEqual, left, right);
  }

  /**
   * Creates a greater than comparison expression
   */
  createGreaterThan(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.GreaterThan, left, right);
  }

  /**
   * Creates a greater than or equal comparison expression
   */
  createGreaterThanOrEqual(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.GreaterThanOrEqual, left, right);
  }

  /**
   * Creates a less than comparison expression
   */
  createLessThan(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.LessThan, left, right);
  }

  /**
   * Creates a less than or equal comparison expression
   */
  createLessThanOrEqual(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.LessThanOrEqual, left, right);
  }

  /**
   * Creates an AND logical operation expression
   */
  createAnd(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.And, left, right);
  }

  /**
   * Creates an OR logical operation expression
   */
  createOr(left: Expression, right: Expression): BinaryExpression {
    return this.createBinary(ExpressionType.Or, left, right);
  }

  /**
   * Creates a NOT logical operation expression
   */
  createNot(operand: Expression): UnaryExpression {
    return this.createUnary(ExpressionType.Not, operand);
  }
}
