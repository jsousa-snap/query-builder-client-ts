/**
 * Defines common types used in query building
 */

import { Expression } from '../expressions/Expression';
import { Queryable } from './Queryable';

/**
 * Represents the direction of an ORDER BY clause
 */
export enum OrderDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Function type for WHERE clauses
 */
export type PredicateFunction<T> = (entity: T) => boolean;

/**
 * Function type for SELECT projections
 */
export type SelectorFunction<T, TResult> = (entity: T) => TResult;

/**
 * Function type for selecting columns for ORDER BY
 */
export type OrderBySelector<T> = (entity: T) => any;

/**
 * Function type for selecting columns for GROUP BY
 */
export type GroupBySelector<T> = (entity: T) => any[];

/**
 * Function type for selecting join keys
 */
export type JoinKeySelector<T> = (entity: T) => any;

/**
 * Function type for combining results in a JOIN
 */
export type JoinResultSelector<TSource, TTarget, TResult> = (
  source: TSource,
  target: TTarget,
) => TResult;

/**
 * Function type for selecting columns for aggregation
 */
export type AggregateSelector<T> = (entity: T) => any;

/**
 * Contexto para criar subconsultas correlacionadas
 */
/**
 * Helper para referenciar propriedades da consulta principal em uma subconsulta
 */
/**
 * Helper para criar subconsultas correlacionadas
 */
export interface SubqueryBuilder<T> {
  /**
   * A subconsulta para modificar
   */
  query: Queryable<T>;

  /**
   * Referencia uma coluna da consulta pai
   * @param columnName Nome da coluna
   * @param tableAlias Alias opcional da tabela (padrão: alias principal)
   */
  parentColumn(columnName: string, tableAlias?: string): Expression;

  /**
   * Adiciona uma condição WHERE de igualdade entre uma coluna da subconsulta e uma coluna da consulta pai
   * @param subqueryColumn Nome da coluna na subconsulta
   * @param parentColumn Nome da coluna na consulta pai
   * @param parentTableAlias Alias opcional da tabela pai
   */
  whereEquals(
    subqueryColumn: string,
    parentColumn: string,
    parentTableAlias?: string,
  ): SubqueryBuilder<T>;

  /**
   * Adiciona uma condição WHERE personalizada usando expressões
   * @param condition Função que constrói a condição usando o builder
   */
  whereCondition(condition: (builder: SubqueryBuilder<T>) => Expression): SubqueryBuilder<T>;
}

/**
 * Helper para criar subconsultas correlacionadas
 */
export interface SubqueryHelper {
  /**
   * Referencia uma coluna da consulta pai
   * @param columnName Nome da coluna
   * @param tableAlias Alias opcional da tabela (padrão: alias principal)
   */
  parentColumn(columnName: string, tableAlias?: string): Expression;

  /**
   * Cria uma condição de igualdade entre uma coluna da subconsulta e uma coluna da consulta pai
   * @param subqueryColumn Nome da coluna na subconsulta
   * @param parentColumn Nome da coluna na consulta pai
   * @param parentTableAlias Alias opcional da tabela pai
   */
  equals(subqueryColumn: string, parentColumn: string, parentTableAlias?: string): Expression;

  /**
   * Cria uma condição de não-igualdade entre uma coluna da subconsulta e uma coluna da consulta pai
   * @param subqueryColumn Nome da coluna na subconsulta
   * @param parentColumn Nome da coluna na consulta pai
   * @param parentTableAlias Alias opcional da tabela pai
   */
  notEquals(subqueryColumn: string, parentColumn: string, parentTableAlias?: string): Expression;

  /**
   * Cria uma condição de maior que entre uma coluna da subconsulta e uma coluna da consulta pai
   * @param subqueryColumn Nome da coluna na subconsulta
   * @param parentColumn Nome da coluna na consulta pai
   * @param parentTableAlias Alias opcional da tabela pai
   */
  greaterThan(subqueryColumn: string, parentColumn: string, parentTableAlias?: string): Expression;

  /**
   * Cria uma condição de menor que entre uma coluna da subconsulta e uma coluna da consulta pai
   * @param subqueryColumn Nome da coluna na subconsulta
   * @param parentColumn Nome da coluna na consulta pai
   * @param parentTableAlias Alias opcional da tabela pai
   */
  lessThan(subqueryColumn: string, parentColumn: string, parentTableAlias?: string): Expression;
}

/**
 * Interface for the state of a query
 */
export interface QueryState<T> {
  /**
   * Name of the table being queried
   */
  tableName: string;

  /**
   * Alias for the table
   */
  alias: string;

  /**
   * Variables that can be used in the query
   */
  contextVariables: Record<string, any>;

  /**
   * Parameter name used in the lambda expressions
   */
  parameterName: string;

  /**
   * Expression builder for constructing the query
   */
  expressionBuilder: any; // Will be defined more precisely later
}
