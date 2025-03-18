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
 * Opções para a geração de SQL
 */
export interface SqlGenerationOptions {
  /** Usar colchetes para identificadores (padrão: true) */
  useDelimitedIdentifiers?: boolean;
  /** Tamanho da indentação (padrão: 2) */
  indentSize?: number;
  /** Flag para indicar se estamos em uma subconsulta */
  isSubquery?: boolean;
}

/**
 * A visitor that generates SQL for SQL Server with proper formatting
 */
export class SqlServerGenerationVisitor implements IExpressionVisitor<string> {
  private parameters: Map<string, any> = new Map();
  private indentLevel: number = 0;
  private indentSize: number = 2;
  private useDelimitedIdentifiers: boolean = true;
  private isSubquery: boolean = false;
  private sb: string[] = []; // String builder simulado

  /**
   * Creates a new SQL Server generation visitor
   * @param parameters Optional map of parameter names to values
   * @param options Optional SQL generation options
   */
  constructor(parameters?: Map<string, any>, options?: SqlGenerationOptions) {
    if (parameters) {
      this.parameters = parameters;
    }

    if (options) {
      this.useDelimitedIdentifiers = options.useDelimitedIdentifiers !== false;
      this.indentSize = options.indentSize || 2;
      this.isSubquery = options.isSubquery || false;
    }
  }

  /**
   * Gets the current indentation string
   */
  private getIndent(): string {
    return ' '.repeat(this.indentLevel * this.indentSize);
  }

  /**
   * Append text to the SQL output
   */
  private append(text: string): void {
    this.sb.push(text);
  }

  /**
   * Append text to the SQL output with a newline and indentation
   */
  private appendLine(text: string = ''): void {
    if (text) {
      this.sb.push('\n' + this.getIndent() + text);
    } else {
      this.sb.push('\n' + this.getIndent());
    }
  }

  /**
   * Increase the indentation level
   */
  private indent(): void {
    this.indentLevel++;
  }

  /**
   * Decrease the indentation level
   */
  private unindent(): void {
    if (this.indentLevel > 0) {
      this.indentLevel--;
    }
  }

  /**
   * Escapes a SQL Server identifier by replacing ] with ]]
   * @param identifier The identifier to escape
   * @returns The escaped identifier
   */
  escapeIdentifier(identifier: string): string | null {
    return identifier?.replace(/]/g, ']]');
  }

  /**
   * Delimits a SQL Server identifier with square brackets
   * @param identifier The identifier to delimit
   * @returns The delimited identifier
   */
  delimitIdentifier(identifier: string): string {
    if (!this.useDelimitedIdentifiers) {
      return identifier;
    }
    return `[${this.escapeIdentifier(identifier)}]`;
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
      return `${operator}(${operand})`;
    }

    return `${operator}(${operand})`;
  }

  /**
   * Visits a column expression
   */
  visitColumnExpression(expr: ColumnExpression): string {
    if (expr.getColumnName() === '*') {
      return `${this.delimitIdentifier(expr.getTableAlias())}.*`;
    }
    // SQL Server usa colchetes para identificadores
    return `${this.delimitIdentifier(expr.getTableAlias())}.${this.delimitIdentifier(expr.getColumnName())}`;
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
      // SQL Server usa N prefix para strings Unicode
      return `N'${this.escapeSqlString(value)}'`;
    }

    if (typeof value === 'boolean') {
      // SQL Server usa 1/0 para booleanos
      return value ? '1' : '0';
    }

    if (value instanceof Date) {
      // Format para datetime no SQL Server
      return `CONVERT(DATETIME2, '${value.toISOString()}', 126)`;
    }

    return String(value);
  }

  /**
   * Visits a function expression
   */
  visitFunctionExpression(expr: FunctionExpression): string {
    const functionName = expr.getFunctionName().toUpperCase();
    const fnArgs = expr.getArguments();

    // Process arguments individually to generate SQL for each one
    const argsStr = fnArgs.map(arg => arg.accept(this)).join(', ');

    // Handle specific SQL Server functions
    switch (functionName) {
      // Standard SQL functions that pass through directly
      case 'SUBSTRING':
      case 'UPPER':
      case 'LOWER':
      case 'LEN':
      case 'GETDATE':
      case 'DATEPART':
        return `${functionName}(${argsStr})`;

      // Direct function mappings
      case 'NOW':
        return `GETDATE()`;
      case 'CURRENT_TIMESTAMP':
        return `GETDATE()`;
      case 'LENGTH':
        return `LEN(${argsStr})`;

      // CONCAT should already be handled correctly
      case 'CONCAT':
        return `CONCAT(${argsStr})`;

      // TRIM for older SQL Server versions
      case 'TRIM':
        return `LTRIM(RTRIM(${argsStr}))`;

      // Special case for EXTRACT - work with original arguments if possible
      case 'EXTRACT':
        if (fnArgs.length === 2) {
          const part = fnArgs[0].accept(this);
          const date = fnArgs[1].accept(this);
          return `DATEPART(${part}, ${date})`;
        } else if (argsStr.includes('FROM')) {
          // Fall back to string parsing if needed
          const parts = argsStr.split(/\s+FROM\s+/);
          if (parts.length === 2) {
            return `DATEPART(${parts[0]}, ${parts[1]})`;
          }
        }
        return `DATEPART(${argsStr})`;

      // Handle INCLUDES - fix the original issue
      case 'INCLUDES':
        if (fnArgs.length === 2) {
          const column = fnArgs[0].accept(this);
          const value = fnArgs[1].accept(this);
          return `${column} LIKE ${value}`;
        }
        return `${argsStr} LIKE N'%%'`;

      // Handle LIKE - similar to INCLUDES
      case 'LIKE':
        if (fnArgs.length === 2) {
          const column = fnArgs[0].accept(this);
          const pattern = fnArgs[1].accept(this);
          return `${column} LIKE ${pattern}`;
        }
        return `${argsStr} LIKE ?`;

      // Default case for all other functions
      default:
        return `${functionName}(${argsStr})`;
    }
  }
  /**
   * Visits a select expression with proper formatting
   */

  visitSelectExpression(expr: SelectExpression): string {
    // If we're in a subquery, we should NOT create a new visitor instance
    // This is causing the infinite recursion

    // Original problematic code:
    // const subqueryOptions: SqlGenerationOptions = {
    //   indentSize: this.indentSize,
    //   useDelimitedIdentifiers: this.useDelimitedIdentifiers,
    //   isSubquery: true,
    // };
    //
    // if (this.isSubquery) {
    //   const subqueryVisitor = new SqlServerGenerationVisitor(this.parameters, subqueryOptions);
    //   return expr.accept(subqueryVisitor);  // This causes infinite recursion!
    // }

    // Fixed version:
    // Save current state
    const originalStringBuilder = [...this.sb];
    const originalIndentLevel = this.indentLevel;

    // Clear state for this query
    this.sb = [];
    this.indentLevel = 0;

    // Add parentheses for subqueries
    if (this.isSubquery) {
      this.append('(');
    }

    // Add SELECT clause
    this.append('SELECT');

    // Verificar se temos LIMIT sem OFFSET - se sim, usar TOP
    const limitValue = expr.getLimitValue();
    const offsetValue = expr.getOffsetValue();
    const orderByColumns = expr.getOrderByColumns();

    // SQL Server requer ORDER BY para OFFSET/FETCH
    if (offsetValue && orderByColumns.length === 0) {
      throw new Error('SQL Server requires ORDER BY when using OFFSET');
    }

    if (expr.getIsDistinct()) {
      this.append(' DISTINCT');
    }

    // SQL Server usa TOP em vez de LIMIT quando não tem OFFSET
    if (limitValue && !offsetValue) {
      this.append(` TOP ${limitValue.accept(this)}`);
    }

    // Add projections
    const projections = expr.getProjections();

    if (projections.length === 0) {
      this.append(' *');
    } else {
      this.appendLine('');
      this.indent();

      // Primeiro campo
      this.append(this.getIndent() + projections[0].accept(this));

      // Campos seguintes (na mesma linha)
      for (let i = 1; i < projections.length; i++) {
        this.append(', ' + projections[i].accept(this));
      }

      this.unindent();
    }

    // Add FROM clause
    this.appendLine('');
    this.append('FROM ' + expr.getFromTable().accept(this));

    // Add JOINs
    const joins = expr.getJoins();
    if (joins.length > 0) {
      this.indent();
      for (const join of joins) {
        this.appendLine(join.accept(this));
      }
      this.unindent();
    }

    // Add WHERE clause
    const whereClause = expr.getWhereClause();
    if (whereClause) {
      this.appendLine('');
      this.append('WHERE ' + whereClause.accept(this));
    }

    // Add GROUP BY clause
    const groupByColumns = expr.getGroupByColumns();
    if (groupByColumns.length > 0) {
      this.appendLine('');
      this.append('GROUP BY ');

      // Todos os campos do GROUP BY na mesma linha
      this.append(groupByColumns.map(c => c.accept(this)).join(', '));

      // Add HAVING clause
      const havingClause = expr.getHavingClause();
      if (havingClause) {
        this.appendLine('');
        this.append('HAVING ' + havingClause.accept(this));
      }
    }

    // Add ORDER BY clause
    if (orderByColumns.length > 0) {
      this.appendLine('');
      this.append('ORDER BY ');

      // Todos os campos do ORDER BY na mesma linha
      const orderByExpr = orderByColumns
        .map(o => {
          const direction = o.isAscending() ? 'ASC' : 'DESC';
          return `${o.getColumn().accept(this)} ${direction}`;
        })
        .join(', ');

      this.append(orderByExpr);
    }

    // SQL Server usa OFFSET/FETCH para paginação (requer ORDER BY)
    if (offsetValue) {
      this.appendLine('');
      this.append(`OFFSET ${offsetValue.accept(this)} ROWS`);

      if (limitValue) {
        this.appendLine('');
        this.append(`FETCH NEXT ${limitValue.accept(this)} ROWS ONLY`);
      }
    }

    // Close parentheses for subqueries
    if (this.isSubquery) {
      this.append(')');
    }

    // Get the SQL result
    const sql = this.sb.join('');

    // Restore original state
    this.sb = originalStringBuilder;
    this.indentLevel = originalIndentLevel;

    // Return the generated SQL
    return sql;
  }

  // Also fix the visitScalarSubqueryExpression method to avoid creating new visitor instances:
  visitScalarSubqueryExpression(expr: ScalarSubqueryExpression): string {
    // Save current state
    const wasSubquery = this.isSubquery;

    // Set subquery flag
    this.isSubquery = true;

    // Generate the subquery SQL
    const subquerySql = expr.getQuery().accept(this);

    // Restore original state
    this.isSubquery = wasSubquery;

    // Return the generated SQL
    return subquerySql;
  }

  /**
   * Visits a table expression
   */
  visitTableExpression(expr: TableExpression): string {
    // SQL Server usa colchetes para identificadores
    return `${this.delimitIdentifier(expr.getTableName())} AS ${this.delimitIdentifier(expr.getAlias())}`;
  }

  /**
   * Visits a join expression
   */
  visitJoinExpression(expr: JoinExpression): string {
    // Mapear tipos de JOIN para SQL Server
    let joinType: string;
    switch (expr.getJoinType()) {
      case JoinType.INNER:
        joinType = 'INNER JOIN';
        break;
      case JoinType.LEFT:
        joinType = 'LEFT OUTER JOIN';
        break;
      case JoinType.RIGHT:
        joinType = 'RIGHT OUTER JOIN';
        break;
      case JoinType.FULL:
        joinType = 'FULL OUTER JOIN';
        break;
      default:
        joinType = 'JOIN';
    }

    return `${joinType} ${expr.getTargetTable().accept(this)} ON ${expr.getJoinCondition().accept(this)}`;
  }

  /**
   * Visits a projection expression
   */
  visitProjectionExpression(expr: ProjectionExpression): string {
    if (!expr.getAlias()) {
      return expr.getExpression().accept(this);
    }

    return `${expr.getExpression().accept(this)} AS ${this.delimitIdentifier(expr.getAlias())}`;
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

    // SQL Server usa @ para parâmetros
    return `@${paramName}`;
  }

  /**
   * Visita uma expressão de coluna pai
   */
  visitParentColumnExpression(expr: ParentColumnExpression): string {
    // SQL Server usa colchetes para identificadores
    return `${this.delimitIdentifier(expr.getTableAlias())}.${this.delimitIdentifier(expr.getColumnName())}`;
  }

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
        return '<>'; // SQL Server prefere <> em vez de !=
      case ExpressionType.GreaterThan:
        return '>';
      case ExpressionType.GreaterThanOrEqual:
        return '>=';
      case ExpressionType.LessThan:
        return '<';
      case ExpressionType.LessThanOrEqual:
        return '<=';
      case ExpressionType.And:
        return 'AND';
      case ExpressionType.Or:
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
}
