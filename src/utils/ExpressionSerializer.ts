import { BinaryExpression } from '../core/expressions/BinaryExpression';
import { UnaryExpression } from '../core/expressions/UnaryExpression';
import { ColumnExpression } from '../core/expressions/ColumnExpression';
import { ConstantExpression } from '../core/expressions/ConstantExpression';
import { FunctionExpression } from '../core/expressions/FunctionExpression';
import { SelectExpression, OrderByExpression } from '../core/expressions/SelectExpression';
import { TableExpression } from '../core/expressions/TableExpression';
import { JoinExpression } from '../core/expressions/JoinExpression';
import { SubqueryExpression } from '../core/expressions/SubqueryExpression';
import { ProjectionExpression } from '../core/expressions/ProjectionExpression';
import { ParameterExpression } from '../core/expressions/ParameterExpression';

import { ExpressionType } from '../core/expressions/Expression';

/**
 * Interface para representação JSON de uma expressão
 */
export interface ExpressionJson {
  type: string;
  [key: string]: any;
}

/**
 * Utilitário para serializar expressões em formato JSON
 */
export class ExpressionSerializer {
  /**
   * Serializa uma expressão para JSON
   * @param expr A expressão a ser serializada
   * @returns Representação JSON da expressão
   */
  static serialize(expr: any | null | undefined): ExpressionJson | null {
    if (!expr) return null;

    // Método genérico de serialização baseado no tipo de expressão
    if (expr instanceof BinaryExpression) {
      return this.serializeBinaryExpression(expr);
    }

    if (expr instanceof UnaryExpression) {
      return this.serializeUnaryExpression(expr);
    }

    if (expr instanceof ColumnExpression) {
      return this.serializeColumnExpression(expr);
    }

    if (expr instanceof ConstantExpression) {
      return this.serializeConstantExpression(expr);
    }

    if (expr instanceof FunctionExpression) {
      return this.serializeFunctionExpression(expr);
    }

    if (expr instanceof SelectExpression) {
      return this.serializeSelectExpression(expr);
    }

    if (expr instanceof TableExpression) {
      return this.serializeTableExpression(expr);
    }

    if (expr instanceof JoinExpression) {
      return this.serializeJoinExpression(expr);
    }

    if (expr instanceof SubqueryExpression) {
      return this.serializeSubqueryExpression(expr);
    }

    if (expr instanceof ProjectionExpression) {
      return this.serializeProjectionExpression(expr);
    }

    if (expr instanceof ParameterExpression) {
      return this.serializeParameterExpression(expr);
    }

    if (expr instanceof OrderByExpression) {
      return this.serializeOrderByExpression(expr);
    }

    throw new Error(`Unsupported expression type: ${expr.constructor.name}`);
  }

  /**
   * Serializa uma expressão binária
   */
  private static serializeBinaryExpression(expr: BinaryExpression): ExpressionJson {
    return {
      type: 'BinaryExpression',
      operatorType: ExpressionType[expr.getOperatorType()],
      left: this.serialize(expr.getLeft()),
      right: this.serialize(expr.getRight()),
    };
  }

  /**
   * Serializa uma expressão unária
   */
  private static serializeUnaryExpression(expr: UnaryExpression): ExpressionJson {
    return {
      type: 'UnaryExpression',
      operatorType: ExpressionType[expr.getOperatorType()],
      operand: this.serialize(expr.getOperand()),
    };
  }

  /**
   * Serializa uma expressão de coluna
   */
  private static serializeColumnExpression(expr: ColumnExpression): ExpressionJson {
    return {
      type: 'ColumnExpression',
      columnName: expr.getColumnName(),
      tableAlias: expr.getTableAlias(),
    };
  }

  /**
   * Serializa uma expressão constante
   */
  private static serializeConstantExpression(expr: ConstantExpression): ExpressionJson {
    return {
      type: 'ConstantExpression',
      value: expr.getValue(),
      valueType: expr.getValueType(),
    };
  }

  /**
   * Serializa uma expressão de função
   */
  private static serializeFunctionExpression(expr: FunctionExpression): ExpressionJson {
    return {
      type: 'FunctionExpression',
      functionName: expr.getFunctionName(),
      arguments: expr.getArguments().map(arg => this.serialize(arg)),
    };
  }

  /**
   * Serializa uma expressão de seleção
   */
  private static serializeSelectExpression(expr: SelectExpression): ExpressionJson {
    return {
      type: 'SelectExpression',
      projections: expr.getProjections().map(p => this.serialize(p)),
      fromTable: this.serialize(expr.getFromTable()),
      joins: expr.getJoins().map(j => this.serialize(j)),
      whereClause: this.serialize(expr.getWhereClause()),
      groupByColumns: expr.getGroupByColumns().map(c => this.serialize(c)),
      havingClause: this.serialize(expr.getHavingClause()),
      orderByColumns: expr.getOrderByColumns().map(o => this.serialize(o)),
      limitValue: this.serialize(expr.getLimitValue()),
      offsetValue: this.serialize(expr.getOffsetValue()),
      isDistinct: expr.getIsDistinct(),
    };
  }

  /**
   * Serializa uma expressão de tabela
   */
  private static serializeTableExpression(expr: TableExpression): ExpressionJson {
    return {
      type: 'TableExpression',
      tableName: expr.getTableName(),
      alias: expr.getAlias(),
    };
  }

  /**
   * Serializa uma expressão de junção
   */
  private static serializeJoinExpression(expr: JoinExpression): ExpressionJson {
    return {
      type: 'JoinExpression',
      targetTable: this.serialize(expr.getTargetTable()),
      joinCondition: this.serialize(expr.getJoinCondition()),
      joinType: expr.getJoinType(),
    };
  }

  /**
   * Serializa uma expressão de subconsulta
   */
  private static serializeSubqueryExpression(expr: SubqueryExpression): ExpressionJson {
    return {
      type: 'SubqueryExpression',
      query: this.serialize(expr.getQuery()),
    };
  }

  /**
   * Serializa uma expressão de projeção
   */
  private static serializeProjectionExpression(expr: ProjectionExpression): ExpressionJson {
    return {
      type: 'ProjectionExpression',
      expression: this.serialize(expr.getExpression()),
      alias: expr.getAlias(),
    };
  }

  /**
   * Serializa uma expressão de parâmetro
   */
  private static serializeParameterExpression(expr: ParameterExpression): ExpressionJson {
    return {
      type: 'ParameterExpression',
      name: expr.getName(),
      parameterType: expr.getParameterType(),
    };
  }

  /**
   * Serializa uma expressão de ordenação
   */
  private static serializeOrderByExpression(expr: OrderByExpression): ExpressionJson {
    return {
      type: 'OrderByExpression',
      column: this.serialize(expr.getColumn()),
      ascending: expr.isAscending(),
    };
  }
}
