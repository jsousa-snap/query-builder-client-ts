import { Expression, IExpressionVisitor } from './Expression';
import { ProjectionExpression } from './ProjectionExpression';
import { TableExpression } from './TableExpression';
import { JoinExpression } from './JoinExpression';

/**
 * Represents a complete SQL SELECT statement
 */
export class SelectExpression extends Expression {
  constructor(
    private readonly projections: ProjectionExpression[],
    private readonly fromTable: TableExpression,
    private readonly joins: JoinExpression[],
    private readonly whereClause: Expression | null,
    private readonly groupByColumns: Expression[],
    private readonly havingClause: Expression | null,
    private readonly orderByColumns: OrderingExpression[],
    private readonly limitValue: Expression | null,
    private readonly offsetValue: Expression | null,
    private readonly isDistinct: boolean,
  ) {
    super();
  }

  /**
   * Gets the projection expressions
   */
  getProjections(): ProjectionExpression[] {
    return this.projections;
  }

  /**
   * Gets the FROM table expression
   */
  getFromTable(): TableExpression {
    return this.fromTable;
  }

  /**
   * Gets the JOIN expressions
   */
  getJoins(): JoinExpression[] {
    return this.joins;
  }

  /**
   * Gets the WHERE clause expression
   */
  getWhereClause(): Expression | null {
    return this.whereClause;
  }

  /**
   * Gets the GROUP BY column expressions
   */
  getGroupByColumns(): Expression[] {
    return this.groupByColumns;
  }

  /**
   * Gets the HAVING clause expression
   */
  getHavingClause(): Expression | null {
    return this.havingClause;
  }

  /**
   * Gets the ORDER BY expressions
   */
  getOrderByColumns(): OrderingExpression[] {
    return this.orderByColumns;
  }

  /**
   * Gets the LIMIT value expression
   */
  getLimitValue(): Expression | null {
    return this.limitValue;
  }

  /**
   * Gets the OFFSET value expression
   */
  getOffsetValue(): Expression | null {
    return this.offsetValue;
  }

  /**
   * Gets whether this is a DISTINCT select
   */
  getIsDistinct(): boolean {
    return this.isDistinct;
  }

  /**
   * Accepts a visitor
   */
  accept<T>(visitor: IExpressionVisitor<T>): T {
    return visitor.visitSelectExpression(this);
  }
}

/**
 * Represents an ORDER BY expression with column and direction
 */
export class OrderingExpression {
  constructor(
    private readonly column: Expression,
    private readonly ascending: boolean,
  ) {}

  /**
   * Gets the column expression
   */
  getColumn(): Expression {
    return this.column;
  }

  /**
   * Gets whether the order is ascending
   */
  isAscending(): boolean {
    return this.ascending;
  }
}
