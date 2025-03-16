import {
  Expression,
  IExpressionVisitor,
  IJoinExpression as IJoinExpression,
  ITableExpression,
} from './Expression';

/**
 * Defines the type of SQL JOIN
 */
export enum JoinType {
  INNER = 'INNER JOIN',
  LEFT = 'LEFT JOIN',
  RIGHT = 'RIGHT JOIN',
  FULL = 'FULL JOIN',
}

/**
 * Represents a JOIN clause in a SQL statement
 */
export class JoinExpression extends Expression implements IJoinExpression {
  constructor(
    private readonly targetTable: ITableExpression,
    private readonly joinCondition: Expression,
    private readonly joinType: JoinType,
  ) {
    super();
  }

  /**
   * Gets the table being joined
   */
  getTargetTable(): ITableExpression {
    return this.targetTable;
  }

  /**
   * Gets the join condition expression
   */
  getJoinCondition(): Expression {
    return this.joinCondition;
  }

  /**
   * Gets the type of join
   */
  getJoinType(): JoinType {
    return this.joinType;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: IExpressionVisitor<T>): T {
    return visitor.visitJoinExpression(this);
  }
}
