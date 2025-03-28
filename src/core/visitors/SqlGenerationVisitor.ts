import { BinaryExpression } from '../expressions/BinaryExpression';
import { ColumnExpression } from '../expressions/ColumnExpression';
import { ConstantExpression } from '../expressions/ConstantExpression';
import { ExpressionType, IExpressionVisitor, IFragmentExpression } from '../expressions/Expression';
import { FunctionExpression } from '../expressions/FunctionExpression';
import { JoinExpression, JoinType } from '../expressions/JoinExpression';
import { ParameterExpression } from '../expressions/ParameterExpression';
import { ParentColumnExpression } from '../expressions/ParentColumnExpression';
import { ProjectionExpression } from '../expressions/ProjectionExpression';
import { SelectExpression } from '../expressions/SelectExpression';
import { ScalarSubqueryExpression } from '../expressions/ScalarSubqueryExpression';
import { TableExpression } from '../expressions/TableExpression';
import { UnaryExpression } from '../expressions/UnaryExpression';

/**
 * A visitor that generates SQL from an expression tree
 */
export class SqlGenerationVisitor implements IExpressionVisitor<string> {
  private parameters: Map<string, any> = new Map();

  /**
   * Creates a new SQL generation visitor
   * @param parameters Optional map of parameter names to values
   */
  constructor(parameters?: Map<string, any>) {
    if (parameters) {
      this.parameters = parameters;
    }
  }

  /**
   * Sets a parameter value
   */
  setParameter(name: string, value: any): void {
    this.parameters.set(name, value);
  }

  /**
   * Visits a binary expression
   */
  visitBinaryExpression(expr: BinaryExpression): string {
    const left = expr.getLeft().accept(this);
    const right = expr.getRight().accept(this);
    const operator = this.getBinaryOperator(expr.getOperatorType());

    // Caso especial para operadores IN e NOT IN com subconsulta
    if (
      expr.getOperatorType() === ExpressionType.In ||
      expr.getOperatorType() === ExpressionType.NotIn
    ) {
      // Se o operando direito é uma subconsulta, remover os parênteses extras
      if (expr.getRight() instanceof ScalarSubqueryExpression) {
        return `${left} ${operator} (${right})`;
      }
      return `${left} ${operator} (${right})`;
    }

    return `(${left} ${operator} ${right})`;
  }

  /**
   * Visits a fragment expression
   */
  visitFragmentExpression(expr: IFragmentExpression): string {
    const value = expr.getValue();
    return value;
  }

  /**
   * Visits a unary expression
   */
  visitUnaryExpression(expr: UnaryExpression): string {
    const operand = expr.getOperand().accept(this);
    const operator = this.getUnaryOperator(expr.getOperatorType());

    // Caso especial para EXISTS e NOT EXISTS
    if (
      expr.getOperatorType() === ExpressionType.Exists ||
      expr.getOperatorType() === ExpressionType.NotExists
    ) {
      // Se o operando é uma subconsulta, certificar-se de que tem os parênteses corretos
      if (expr.getOperand() instanceof ScalarSubqueryExpression) {
        return `${operator}(${operand})`;
      }
      return `${operator}(${operand})`;
    }

    return `${operator}(${operand})`;
  }

  /**
   * Visits a column expression
   */
  visitColumnExpression(expr: ColumnExpression): string {
    if (expr.getColumnName() === '*') {
      return `${expr.getTableAlias()}.*`;
    }
    return `${expr.getTableAlias()}.${expr.getColumnName()}`;
  }

  /**
   * Visits a constant expression
   */
  visitConstantExpression(expr: ConstantExpression): string {
    const value = expr.getValue();

    if (value === null) {
      return 'NULL';
    }

    if (typeof value === 'string') {
      return `'${this.escapeSqlString(value)}'`;
    }

    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    return String(value);
  }

  /**
   * Visits a function expression
   */
  visitFunctionExpression(expr: FunctionExpression): string {
    const args = expr
      .getArguments()
      .map(arg => arg.accept(this))
      .join(', ');
    return `${expr.getFunctionName()}(${args})`;
  }

  /**
   * Visits a select expression
   */
  visitSelectExpression(expr: SelectExpression): string {
    // Build SELECT clause
    let sql = 'SELECT ';

    // Verificar se temos LIMIT sem OFFSET - se sim, usar TOP
    const limitValue = expr.getLimitValue();
    const offsetValue = expr.getOffsetValue();

    if (limitValue && !offsetValue) {
      // Temos LIMIT sem OFFSET, usar TOP
      sql += `TOP ${limitValue.accept(this)} `;
    }

    if (expr.getIsDistinct()) {
      sql += 'DISTINCT ';
    }

    // Add projections
    const projections = expr.getProjections();
    if (projections.length === 0) {
      sql += '*';
    } else {
      sql += projections.map(p => p.accept(this)).join(', ');
    }

    // Add FROM clause
    sql += ` FROM ${expr.getFromTable().accept(this)}`;

    // Add JOINs
    const joins = expr.getJoins();
    if (joins.length > 0) {
      sql += ' ' + joins.map(j => j.accept(this)).join(' ');
    }

    // Add WHERE clause
    const whereClause = expr.getWhereClause();
    if (whereClause) {
      sql += ` WHERE ${whereClause.accept(this)}`;
    }

    // Add GROUP BY clause
    const groupByColumns = expr.getGroupByColumns();
    if (groupByColumns.length > 0) {
      sql += ` GROUP BY ${groupByColumns.map(c => c.accept(this)).join(', ')}`;

      // Add HAVING clause
      const havingClause = expr.getHavingClause();
      if (havingClause) {
        sql += ` HAVING ${havingClause.accept(this)}`;
      }
    }

    // Add ORDER BY clause
    const orderByColumns = expr.getOrderByColumns();
    if (orderByColumns.length > 0) {
      sql += ` ORDER BY ${orderByColumns
        .map(o => `${o.getColumn().accept(this)} ${o.isAscending() ? 'ASC' : 'DESC'}`)
        .join(', ')}`;
    }

    // Add LIMIT/OFFSET apenas se temos OFFSET ou não usamos TOP
    if (offsetValue) {
      // Com OFFSET, usar LIMIT normalmente
      if (limitValue) {
        sql += ` LIMIT ${limitValue.accept(this)}`;
      } else {
        // Se tiver OFFSET sem LIMIT, usar um valor grande
        sql += ` LIMIT 2147483647`;
      }
      sql += ` OFFSET ${offsetValue.accept(this)}`;
    } else if (limitValue && !offsetValue && !sql.includes('TOP')) {
      // Caso em que optamos por não usar TOP (não deveria acontecer, mas por precaução)
      sql += ` LIMIT ${limitValue.accept(this)}`;
    }

    return sql;
  }

  /**
   * Visits a table expression
   */
  visitTableExpression(expr: TableExpression): string {
    return `${expr.getTableName()} AS ${expr.getAlias()}`;
  }

  /**
   * Visits a join expression
   */
  visitJoinExpression(expr: JoinExpression): string {
    return `${expr.getJoinType()} ${expr.getTargetTable().accept(this)} ON ${expr.getJoinCondition().accept(this)}`;
  }

  /**
   * Visits a subquery expression
   */
  visitScalarSubqueryExpression(expr: ScalarSubqueryExpression): string {
    return `(${expr.getQuery().accept(this)})`;
  }

  /**
   * Visits a projection expression
   */
  visitProjectionExpression(expr: ProjectionExpression): string {
    return `${expr.getExpression().accept(this)} AS ${expr.getAlias()}`;
  }

  /**
   * Visits a parameter expression
   */
  visitParameterExpression(expr: ParameterExpression): string {
    const paramName = expr.getName();
    if (this.parameters.has(paramName)) {
      const value = this.parameters.get(paramName);

      // Create a constant expression with the parameter value
      const constExpr = new ConstantExpression(value);
      return constExpr.accept(this);
    }

    // Parameter not found, return placeholder
    return `@${paramName}`;
  }

  /**
   * Visita uma expressão de coluna pai
   */
  visitParentColumnExpression(expr: ParentColumnExpression): string {
    return `${expr.getTableAlias()}.${expr.getColumnName()}`;
  }

  /**
   * Maps a binary expression type to SQL operator
   */
  /**
   * Maps a binary expression type to SQL operator
   */
  private getBinaryOperator(type: ExpressionType): string {
    switch (type) {
      case ExpressionType.Add:
        return '+';
      case ExpressionType.Subtract:
        return '-';
      case ExpressionType.Multiply:
        return '*';
      case ExpressionType.Divide:
        return '/';
      case ExpressionType.Modulo:
        return '%';
      case ExpressionType.Equal:
        return '=';
      case ExpressionType.NotEqual:
        return '!=';
      case ExpressionType.GreaterThan:
        return '>';
      case ExpressionType.GreaterThanOrEqual:
        return '>=';
      case ExpressionType.LessThan:
        return '<';
      case ExpressionType.LessThanOrEqual:
        return '<=';
      case ExpressionType.AndAlso:
        return 'AND';
      case ExpressionType.OrElse:
        return 'OR';
      case ExpressionType.In:
        return 'IN';
      case ExpressionType.NotIn:
        return 'NOT IN';
      default:
        throw new Error(`Unsupported binary operator: ${ExpressionType[type]}`);
    }
  }

  /**
   * Maps a unary expression type to SQL operator
   */
  private getUnaryOperator(type: ExpressionType): string {
    switch (type) {
      case ExpressionType.Not:
        return 'NOT ';
      case ExpressionType.Negate:
        return '-';
      case ExpressionType.Exists:
        return 'EXISTS ';
      case ExpressionType.NotExists:
        return 'NOT EXISTS ';
      default:
        throw new Error(`Unsupported unary operator: ${ExpressionType[type]}`);
    }
  }

  /**
   * Escapes a string for SQL to prevent SQL injection
   */
  private escapeSqlString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Formats the final SQL for better readability
   */
  formatSql(sql: string): string {
    // Simple formatter that adds line breaks and indentation
    return sql
      .replace(/SELECT/g, '\nSELECT\n  ')
      .replace(/FROM/g, '\nFROM\n  ')
      .replace(/WHERE/g, '\nWHERE\n  ')
      .replace(/GROUP BY/g, '\nGROUP BY\n  ')
      .replace(/HAVING/g, '\nHAVING\n  ')
      .replace(/ORDER BY/g, '\nORDER BY\n  ')
      .replace(/LIMIT/g, '\nLIMIT ')
      .replace(/OFFSET/g, '\nOFFSET ')
      .replace(/ (INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN) /g, '\n  $1 ')
      .replace(/ ON /g, ' ON ')
      .replace(/,/g, ',\n  ');
  }
}
