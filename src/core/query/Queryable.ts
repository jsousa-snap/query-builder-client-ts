import { DbSet } from '../context/DbSet';
import {
  PredicateFunction,
  SelectorFunction,
  OrderBySelector,
  GroupBySelector,
  JoinKeySelector,
  JoinResultSelector,
  AggregateSelector,
  OrderDirection,
} from './Types';

import { JoinType, JoinExpression } from '../expressions/JoinExpression';
import { OrderByExpression, SelectExpression } from '../expressions/SelectExpression';
import { ExpressionBuilder } from './ExpressionBuilder';
import { LambdaParser } from './LambdaParser';
import { SqlGenerationVisitor } from '../visitors/SqlGenerationVisitor';
import { TableExpression } from '../expressions/TableExpression';
import { Expression } from '../expressions/Expression';
import { ProjectionExpression } from '../expressions/ProjectionExpression';
import { ColumnExpression } from '../expressions/ColumnExpression';
import { BinaryExpression } from '../expressions/BinaryExpression';
import { formatSQLClientStyle } from '../../utils/SqlFormatter';
import { PropertyTracker } from './PropertyTracker';
import { SubqueryExpression } from '../expressions/SubqueryExpression';

class ResultInfo {
  constructor(
    public readonly tableName: string,
    public readonly tableAlias: string,
  ) {}
}

/**
 * Represents a query that can be built and executed against a data source
 */
export class Queryable<T> {
  private readonly expressionBuilder: ExpressionBuilder;
  private readonly lambdaParser: LambdaParser;

  // Query components
  private fromTable: TableExpression;
  private whereClause: Expression | null = null;
  private projections: ProjectionExpression[] = [];
  private joins: JoinExpression[] = [];
  private groupByColumns: Expression[] = [];
  private havingClause: Expression | null = null;
  private orderByColumns: OrderByExpression[] = [];
  private limitValue: Expression | null = null;
  private offsetValue: Expression | null = null;
  private isDistinct: boolean = false;

  // Rastreador de propriedades
  private propertyTracker: PropertyTracker;

  /**
   * Creates a new queryable
   * @param tableName The name of the table
   * @param alias The alias for the table
   * @param variables Context variables for the query
   */
  constructor(
    private readonly tableName: string,
    private readonly alias: string,
    private readonly contextVariables: Record<string, any> = {},
    propertyTracker?: PropertyTracker,
  ) {
    this.expressionBuilder = new ExpressionBuilder();
    this.lambdaParser = new LambdaParser(this.expressionBuilder, contextVariables);
    this.fromTable = this.expressionBuilder.createTable(tableName, alias);

    // Inicializar o rastreador de propriedades
    this.propertyTracker = propertyTracker || new PropertyTracker();
    this.propertyTracker.registerTable(tableName, alias);
  }

  /**
   * Obtém o rastreador de propriedades
   */
  getPropertyTracker(): PropertyTracker {
    return this.propertyTracker;
  }

  /**
   * Adds variables to the context
   * @param variables Variables to add
   */
  withVariables(variables: Record<string, any>): Queryable<T> {
    // Create a new queryable with merged variables
    const newQueryable = new Queryable<T>(
      this.tableName,
      this.alias,
      {
        ...this.contextVariables,
        ...variables,
      },
      this.propertyTracker.clone(),
    );

    // Copy all the query components
    newQueryable.fromTable = this.fromTable;
    newQueryable.whereClause = this.whereClause;
    newQueryable.projections = [...this.projections];
    newQueryable.joins = [...this.joins];
    newQueryable.groupByColumns = [...this.groupByColumns];
    newQueryable.havingClause = this.havingClause;
    newQueryable.orderByColumns = [...this.orderByColumns];
    newQueryable.limitValue = this.limitValue;
    newQueryable.offsetValue = this.offsetValue;
    newQueryable.isDistinct = this.isDistinct;

    return newQueryable;
  }

  /**
   * Adds a WHERE clause to the query
   * @param predicate The predicate function
   */
  where(predicate: PredicateFunction<T>): Queryable<T> {
    // Obter a string da função predicado
    const predicateStr = predicate.toString();

    // Criar um novo queryable
    const newQueryable = this.clone();

    // Verificar se o predicado contém propriedades aninhadas
    const hasNestedProperties = predicateStr.match(/\w+\.\w+\.\w+/) !== null;

    if (hasNestedProperties) {
      try {
        // Analisar o predicado manualmente para detectar propriedades aninhadas
        const nestedProperties = this.extractNestedProperties(predicateStr);

        // Se encontramos propriedades aninhadas, criar uma expressão WHERE customizada
        if (nestedProperties.length > 0) {
          // Primeiro, processamos o predicado normalmente
          let predicateExpr = this.lambdaParser.parsePredicate<T>(predicate, this.alias);

          // Depois, substituímos as propriedades aninhadas com os aliases corretos
          for (const prop of nestedProperties) {
            predicateExpr = this.replaceNestedPropertyInExpression(
              predicateExpr,
              prop.fullPath,
              prop.objectName,
              prop.propertyName,
            );
          }

          // Se já existe uma cláusula where, fazer um AND com a nova
          if (newQueryable.whereClause) {
            newQueryable.whereClause = this.expressionBuilder.createAnd(
              newQueryable.whereClause,
              predicateExpr,
            );
          } else {
            newQueryable.whereClause = predicateExpr;
          }

          return newQueryable;
        }
      } catch (err) {
        console.warn('Erro ao processar predicado aninhado:', err);
        // Fallback para o método padrão
      }
    }

    // Método padrão: analisar o predicado normalmente
    const predicateExpr = this.lambdaParser.parsePredicate<T>(predicate, this.alias);

    // Se já existe uma cláusula where, fazer um AND com a nova
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.expressionBuilder.createAnd(
        newQueryable.whereClause,
        predicateExpr,
      );
    } else {
      newQueryable.whereClause = predicateExpr;
    }

    return newQueryable;
  }

  /**
   * Adiciona uma subconsulta à seleção
   * @param propertyName Nome da propriedade para o resultado da subconsulta
   * @param subquerySource DbSet fonte para a subconsulta
   * @param parentSelector Seletor para a coluna da consulta pai
   * @param subquerySelector Seletor para a coluna da subconsulta
   * @param subqueryBuilder Função que modifica a subconsulta
   */
  /**
   * Adiciona uma subconsulta à seleção
   * @param propertyName Nome da propriedade para o resultado da subconsulta
   * @param subquerySource DbSet fonte para a subconsulta
   * @param parentSelector Seletor para a coluna da consulta pai
   * @param subquerySelector Seletor para a coluna da subconsulta
   * @param subqueryBuilder Função que modifica a subconsulta
   */
  withSubquery<U, TResult>(
    propertyName: string,
    subquerySource: DbSet<U>,
    parentSelector: (entity: T) => any,
    subquerySelector: (entity: U) => any,
    subqueryBuilder: (query: Queryable<U>) => Queryable<TResult>,
  ): Queryable<T & Record<string, TResult>> {
    // Criar um clone deste queryable
    const newQueryable = this.clone();

    // Analisar o seletor para a coluna da subconsulta
    const subquerySelectorStr = subquerySelector.toString();
    const subPropMatch = subquerySelectorStr.match(/=>.*?\.(\w+)/);
    const subqueryColumn = subPropMatch ? subPropMatch[1] : 'id';

    // Analisar o seletor pai para obter o nome da propriedade
    const parentSelectorStr = parentSelector.toString();

    // Definir valores padrão
    let parentTableAlias = this.alias;
    let parentColumn = 'id';

    // Verificar se estamos após um select()
    const afterSelect = this.projections.length > 0;

    // Extrair o nome da propriedade pai
    const propMatch = parentSelectorStr.match(/=>.*?(?:\w+\.)?(\w+)/);
    if (propMatch && propMatch[1]) {
      const propName = propMatch[1];

      if (afterSelect) {
        // Procurar a propriedade na lista de projeções
        for (const projection of this.projections) {
          if (projection.getAlias() === propName) {
            // Encontramos a projeção - verificar se é uma expressão de coluna
            const expr = projection.getExpression();

            // Para expressões de coluna, extraímos o alias e nome da coluna
            if (expr.accept) {
              try {
                // Tentar verificar se é uma ColumnExpression
                if (expr instanceof ColumnExpression) {
                  parentTableAlias = expr.getTableAlias();
                  parentColumn = expr.getColumnName();
                  break;
                }
              } catch {
                // Se não conseguir verificar diretamente, tentamos um método mais genérico
                const str = String(expr);
                if (str.includes('Column')) {
                  // Tentar extrair com regex
                  const tableMatch = str.match(/tableAlias:\s*['"]([^'"]+)['"]/);
                  const colMatch = str.match(/columnName:\s*['"]([^'"]+)['"]/);

                  if (tableMatch && colMatch) {
                    parentTableAlias = tableMatch[1];
                    parentColumn = colMatch[1];
                    break;
                  }
                }
              }
            }
          }
        }
      } else {
        // Antes de select, verificar se é uma propriedade aninhada
        const nestedMatch = parentSelectorStr.match(/=>.*?(\w+)\.(\w+)\.(\w+)/);
        if (nestedMatch) {
          // Caso: joined.post.id
          const objectName = nestedMatch[2]; // Ex: "post"
          parentColumn = nestedMatch[3]; // Ex: "id"

          // Procurar nos joins
          for (const join of this.joins) {
            const targetTable = join.getTargetTable();
            const targetName = targetTable.getTableName();
            const targetAlias = targetTable.getAlias();

            if (
              targetName.toLowerCase().includes(objectName.toLowerCase()) ||
              targetAlias === objectName.toLowerCase().charAt(0)
            ) {
              parentTableAlias = targetAlias;
              break;
            }
          }
        } else {
          // Caso simple: entity.id
          const simpleMatch = parentSelectorStr.match(/=>.*?(?:(\w+)\.)?(\w+)/);
          if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
            // Caso: object.property
            const objectName = simpleMatch[1];
            parentColumn = simpleMatch[2];

            // Procurar nos joins
            for (const join of this.joins) {
              const targetTable = join.getTargetTable();
              const targetName = targetTable.getTableName();
              const targetAlias = targetTable.getAlias();

              if (
                targetName.toLowerCase().includes(objectName.toLowerCase()) ||
                targetAlias === objectName.toLowerCase().charAt(0)
              ) {
                parentTableAlias = targetAlias;
                break;
              }
            }
          }
        }
      }
    }

    // Construir a consulta base
    const subquery = subquerySource.query();

    // Criar a condição de correlação
    const parentColumnExpr = this.expressionBuilder.createColumn(parentColumn, parentTableAlias);
    const subColumnExpr = subquery.expressionBuilder.createColumn(
      subqueryColumn,
      subquerySource.getAlias(),
    );
    const equalityExpr = subquery.expressionBuilder.createEqual(subColumnExpr, parentColumnExpr);

    // Adicionar a condição à subconsulta
    subquery.whereClause = equalityExpr;

    // Aplicar qualquer transformação adicional (como count, etc)
    const transformedSubquery = subqueryBuilder(subquery);

    // Criar a expressão de subconsulta
    const subqueryExpr = this.expressionBuilder.createSubquery(transformedSubquery.toMetadata());

    // Criar a expressão de projeção
    const projectionExpr = this.expressionBuilder.createProjection(subqueryExpr, propertyName);

    // Adicionar à lista de projeções
    newQueryable.projections.push(projectionExpr);

    return newQueryable as any;
  }

  // funcionou
  select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult> {
    // Salvar as projeções existentes que são subconsultas
    const existingSubqueries = this.projections.filter(p => {
      const expr = p.getExpression();
      try {
        return expr instanceof SubqueryExpression;
      } catch {
        return false;
      }
    });

    // Criar um novo queryable com o novo tipo de resultado
    const newQueryable = this.cloneWithNewType<TResult>();

    // Obter o texto da função seletora para análise
    const selectorStr = selector.toString();

    try {
      // Extrair os mapeamentos de propriedades usando o LambdaParser aprimorado
      const lambdaParser = new LambdaParser(
        this.expressionBuilder,
        this.contextVariables,
        this.propertyTracker,
      );

      // Analisar o seletor para extrair os mapeamentos de propriedades com informações de origem
      const propertyMappings = lambdaParser.parseSelectorEnhanced<T, TResult>(selector, this.alias);

      // Converter os mapeamentos para expressões de projeção
      newQueryable.projections = [];

      for (const [propertyName, mapping] of propertyMappings.entries()) {
        // Verificar se a expressão é um Queryable (subquery)
        if (mapping.expression instanceof ColumnExpression) {
          const columnName = mapping.columnName || mapping.expression.getColumnName();
          let tableAlias = mapping.tableAlias || mapping.expression.getTableAlias();

          // Verificar se há um caminho de propriedade aninhada (ex: joined.order.amount)
          if (mapping.propertyPath && mapping.propertyPath.length > 1) {
            // Tentar encontrar a tabela correta para esta propriedade aninhada
            const source = this.resolveNestedPropertySource(mapping.propertyPath);

            if (source) {
              tableAlias = source.tableAlias;
            }
          }

          // Criar uma nova expressão de coluna com o alias correto
          const columnExpr = this.expressionBuilder.createColumn(columnName, tableAlias);

          // Criar a projeção para esta propriedade
          const projectionExpr = this.expressionBuilder.createProjection(columnExpr, propertyName);

          // Adicionar à lista de projeções
          newQueryable.projections.push(projectionExpr);

          // Registrar a propriedade no rastreador
          newQueryable.propertyTracker.registerProperty(propertyName, tableAlias, columnName);
        } else {
          // Para expressões que não são simples acessos de coluna (ex: cálculos, funções)
          const projectionExpr = this.expressionBuilder.createProjection(
            mapping.expression,
            propertyName,
          );
          newQueryable.projections.push(projectionExpr);

          // Registrar como expressão complexa
          if (mapping.tableAlias) {
            newQueryable.propertyTracker.registerProperty(
              propertyName,
              mapping.tableAlias,
              mapping.columnName || 'expression',
            );
          }
        }
      }
    } catch (error) {
      console.warn('Erro na análise avançada do selector, usando método padrão:', error);
    }

    // Adicionar as subconsultas existentes de volta
    newQueryable.projections.push(...existingSubqueries);

    return newQueryable;
  }

  /**
   * Adds a SELECT clause to the query
   * @param selector The selector function
   */
  // select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult> {
  //   // Criar um novo queryable com o novo tipo de resultado
  //   const newQueryable = this.cloneWithNewType<TResult>();

  //   // Obter o texto da função seletora para análise
  //   const selectorStr = selector.toString();

  //   try {
  //     // Extrair os mapeamentos de propriedades usando o LambdaParser aprimorado
  //     const lambdaParser = new LambdaParser(
  //       this.expressionBuilder,
  //       this.contextVariables,
  //       this.propertyTracker,
  //     );

  //     // Analisar o seletor para extrair os mapeamentos de propriedades com informações de origem
  //     const propertyMappings = lambdaParser.parseSelectorEnhanced<T, TResult>(selector, this.alias);

  //     // Converter os mapeamentos para expressões de projeção
  //     newQueryable.projections = [];

  //     for (const [propertyName, mapping] of propertyMappings.entries()) {
  //       // Verificar se a expressão é um Queryable (subquery)
  //       if (
  //         mapping.expression instanceof FunctionExpression &&
  //         mapping.expression.getFunctionName() === 'select'
  //       ) {
  //         // Handle FunctionExpression (potential subquery)
  //         // **TODO: Implement logic to process the FunctionExpression and build the subquery**
  //         // This will involve analyzing the function's body to find the Queryable operations (where, select, etc.)
  //         // and constructing the corresponding SelectExpression.
  //         // For now, let's create a placeholder:
  //         const innerSelectExpression = this.expressionBuilder.createSelect(
  //           [],
  //           new TableExpression('temp', 't'),
  //         );
  //         const subqueryExpr = this.expressionBuilder.createSubquery(innerSelectExpression);
  //         const projectionExpr = this.expressionBuilder.createProjection(
  //           subqueryExpr,
  //           propertyName,
  //         );
  //         newQueryable.projections.push(projectionExpr);
  //       } else if (mapping.expression instanceof ColumnExpression) {
  //         const columnName = mapping.columnName || mapping.expression.getColumnName();
  //         let tableAlias = mapping.tableAlias || mapping.expression.getTableAlias();

  //         // Verificar se há um caminho de propriedade aninhada (ex: joined.order.amount)
  //         if (mapping.propertyPath && mapping.propertyPath.length > 1) {
  //           // Tentar encontrar a tabela correta para esta propriedade aninhada
  //           const source = this.resolveNestedPropertySource(mapping.propertyPath);

  //           if (source) {
  //             tableAlias = source.tableAlias;
  //           }
  //         }

  //         // Criar uma nova expressão de coluna com o alias correto
  //         const columnExpr = this.expressionBuilder.createColumn(columnName, tableAlias);

  //         // Criar a projeção para esta propriedade
  //         const projectionExpr = this.expressionBuilder.createProjection(columnExpr, propertyName);

  //         // Adicionar à lista de projeções
  //         newQueryable.projections.push(projectionExpr);

  //         // Registrar a propriedade no rastreador
  //         newQueryable.propertyTracker.registerProperty(propertyName, tableAlias, columnName);
  //       } else {
  //         // Para expressões que não são simples acessos de coluna (ex: cálculos, funções)
  //         const projectionExpr = this.expressionBuilder.createProjection(
  //           mapping.expression,
  //           propertyName,
  //         );
  //         newQueryable.projections.push(projectionExpr);

  //         // Registrar como expressão complexa
  //         if (mapping.tableAlias) {
  //           newQueryable.propertyTracker.registerProperty(
  //             propertyName,
  //             mapping.tableAlias,
  //             mapping.columnName || 'expression',
  //           );
  //         }
  //       }
  //     }
  //   } catch (error) {
  //     // Se houver erro na análise avançada, cair para o método padrão
  //     console.warn('Erro na análise avançada do selector, usando método padrão:', error);

  //     // Analisar o seletor em um mapa de propriedade -> expressão (método padrão)
  //     const projections = this.lambdaParser.parseSelector<T, TResult>(selector, this.alias);

  //     // Converter o mapa em expressões de projeção
  //     newQueryable.projections = [];
  //     for (const [propertyName, expression] of projections.entries()) {
  //       if (expression instanceof Queryable) {
  //         const innerSelectExpression = this.expressionBuilder.createSelect(
  //           expression.projections,
  //           expression.fromTable,
  //           expression.joins,
  //           expression.whereClause,
  //           expression.groupByColumns,
  //           expression.havingClause,
  //           expression.orderByColumns,
  //           expression.limitValue,
  //           expression.offsetValue,
  //           expression.isDistinct,
  //         );
  //         const subqueryExpr = this.expressionBuilder.createSubquery(innerSelectExpression);
  //         newQueryable.projections.push(
  //           this.expressionBuilder.createProjection(subqueryExpr, propertyName),
  //         );
  //       } else {
  //         newQueryable.projections.push(
  //           this.expressionBuilder.createProjection(expression, propertyName),
  //         );
  //       }
  //     }
  //   }

  //   return newQueryable;
  // }
  // select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult> {
  //   // Criar um novo queryable com o novo tipo de resultado
  //   const newQueryable = this.cloneWithNewType<TResult>();

  //   // Obter o texto da função seletora para análise
  //   const selectorStr = selector.toString();

  //   try {
  //     // Extrair os mapeamentos de propriedades usando o LambdaParser aprimorado
  //     const lambdaParser = new LambdaParser(
  //       this.expressionBuilder,
  //       this.contextVariables,
  //       this.propertyTracker,
  //     );

  //     // Analisar o seletor para extrair os mapeamentos de propriedades com informações de origem
  //     const propertyMappings = lambdaParser.parseSelectorEnhanced<T, TResult>(selector, this.alias);

  //     // Converter os mapeamentos para expressões de projeção
  //     newQueryable.projections = [];

  //     for (const [propertyName, mapping] of propertyMappings.entries()) {
  //       // Verificar se a expressão é um acesso de propriedade aninhada
  //       if (mapping.expression instanceof ColumnExpression) {
  //         const columnName = mapping.columnName || mapping.expression.getColumnName();
  //         let tableAlias = mapping.tableAlias || mapping.expression.getTableAlias();

  //         // Verificar se há um caminho de propriedade aninhada (ex: joined.order.amount)
  //         if (mapping.propertyPath && mapping.propertyPath.length > 1) {
  //           // Tentar encontrar a tabela correta para esta propriedade aninhada
  //           const source = this.resolveNestedPropertySource(mapping.propertyPath);

  //           if (source) {
  //             tableAlias = source.tableAlias;
  //           }
  //         }

  //         // Criar uma nova expressão de coluna com o alias correto
  //         const columnExpr = this.expressionBuilder.createColumn(columnName, tableAlias);

  //         // Criar a projeção para esta propriedade
  //         const projectionExpr = this.expressionBuilder.createProjection(columnExpr, propertyName);

  //         // Adicionar à lista de projeções
  //         newQueryable.projections.push(projectionExpr);

  //         // Registrar a propriedade no rastreador
  //         newQueryable.propertyTracker.registerProperty(propertyName, tableAlias, columnName);
  //       } else {
  //         // Para expressões que não são simples acessos de coluna (ex: cálculos, funções)
  //         const projectionExpr = this.expressionBuilder.createProjection(
  //           mapping.expression,
  //           propertyName,
  //         );
  //         newQueryable.projections.push(projectionExpr);

  //         // Registrar como expressão complexa
  //         if (mapping.tableAlias) {
  //           newQueryable.propertyTracker.registerProperty(
  //             propertyName,
  //             mapping.tableAlias,
  //             mapping.columnName || 'expression',
  //           );
  //         }
  //       }
  //     }
  //   } catch (error) {
  //     // Se houver erro na análise avançada, cair para o método padrão
  //     console.warn('Erro na análise avançada do selector, usando método padrão:', error);

  //     // Analisar o seletor em um mapa de propriedade -> expressão (método padrão)
  //     const projections = this.lambdaParser.parseSelector<T, TResult>(selector, this.alias);

  //     // Converter o mapa em expressões de projeção
  //     newQueryable.projections = [];
  //     for (const [propertyName, expression] of projections.entries()) {
  //       newQueryable.projections.push(
  //         this.expressionBuilder.createProjection(expression, propertyName),
  //       );
  //     }
  //   }

  //   return newQueryable;
  // }

  /**
   * Determina a origem de uma propriedade aninhada (ex: joined.order.amount)
   * @param path Caminho da propriedade aninhada
   * @returns Fonte da propriedade ou undefined se não encontrada
   */
  private resolveNestedPropertySource(
    path: string[],
  ): { tableAlias: string; columnName: string } | undefined {
    if (!this.propertyTracker || path.length < 2) {
      return undefined;
    }

    // Passo 1: Verificar se o primeiro nível do caminho é um objeto conhecido
    const firstLevel = path[0];
    const firstLevelSource = this.propertyTracker.getPropertySource(firstLevel);

    if (firstLevelSource) {
      // Passo 2: Verificar se há um indicador de que este objeto pertence a uma tabela específica
      const secondLevel = path[1];

      // Verificar por um registro de wildcard para este objeto
      const wildcardKey = `${firstLevel}.*`;
      const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);

      if (wildcardSource) {
        return {
          tableAlias: wildcardSource.tableAlias,
          columnName: path[path.length - 1],
        };
      }

      // Passo 3: Verificar se o segundo nível corresponde a uma tabela ou objeto conhecido
      for (const tableAlias of this.propertyTracker.getTableAliases()) {
        // Verificar por correspondência direta ou padrão de nomeação (ex: order -> o)
        if (
          tableAlias === secondLevel ||
          (secondLevel.length > 0 && tableAlias === secondLevel[0])
        ) {
          return {
            tableAlias: tableAlias,
            columnName: path[path.length - 1],
          };
        }
      }

      // Se o primeiro nível tem uma fonte conhecida, usar essa informação
      return {
        tableAlias: firstLevelSource.tableAlias,
        columnName: path[path.length - 1],
      };
    }

    // Passo 4: Verificar se qualquer parte do caminho corresponde a uma tabela conhecida
    for (let i = 0; i < path.length - 1; i++) {
      const part = path[i];

      // Buscar por correspondência direta com alguma tabela
      for (const tableAlias of this.propertyTracker.getTableAliases()) {
        if (tableAlias === part || (part.length > 0 && tableAlias === part[0])) {
          return {
            tableAlias: tableAlias,
            columnName: path[path.length - 1],
          };
        }
      }

      // Verificar se esta parte tem uma fonte conhecida
      const partSource = this.propertyTracker.getPropertySource(part);
      if (partSource) {
        return {
          tableAlias: partSource.tableAlias,
          columnName: path[path.length - 1],
        };
      }
    }

    return undefined;
  }

  /**
   * Função específica para processar o selector de chave de fonte aninhada em um join
   * @param sourceKeySelector Função seletora da chave de junção
   * @returns Informações da chave processada
   */
  private processNestedJoinKey<T>(sourceKeySelector: (entity: T) => any): {
    tableAlias: string;
    columnName: string;
  } {
    const selectorStr = sourceKeySelector.toString();

    // Verificar se temos uma propriedade aninhada do tipo joined.order.id
    const nestedMatch = selectorStr.match(/=>\s*\w+\.(\w+)\.(\w+)/);
    if (nestedMatch && nestedMatch[1] && nestedMatch[2]) {
      const objectName = nestedMatch[1]; // "order"
      const propertyName = nestedMatch[2]; // "id"

      // Tentar encontrar a tabela correta para o objeto aninhado
      if (this.propertyTracker) {
        // 1. Verificar se o objeto está diretamente registrado
        const objectSource = this.propertyTracker.getPropertySource(objectName);
        if (objectSource) {
          return {
            tableAlias: objectSource.tableAlias,
            columnName: propertyName,
          };
        }

        // 2. Verificar registros de wildcard
        const wildcardKey = `${objectName}.*`;
        const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
        if (wildcardSource) {
          return {
            tableAlias: wildcardSource.tableAlias,
            columnName: propertyName,
          };
        }

        // 3. Buscar em todos os joins anteriores para ver se algum resultou em um objeto com este nome
        for (const [propName, source] of this.propertyTracker.getAllPropertySources().entries()) {
          if (
            propName === objectName ||
            (source.propertyPath && source.propertyPath[0] === objectName)
          ) {
            return {
              tableAlias: source.tableAlias,
              columnName: propertyName,
            };
          }
        }

        // 4. Verificar correspondência de alias com o nome do objeto
        for (const alias of this.propertyTracker.getTableAliases()) {
          // Correspondência exata (order -> order) ou inicial (order -> o)
          if (alias === objectName || objectName.charAt(0).toLowerCase() === alias.toLowerCase()) {
            return {
              tableAlias: alias,
              columnName: propertyName,
            };
          }
        }
      }
    }

    // Se não for uma propriedade aninhada ou não conseguirmos resolver,
    // extrair apenas a propriedade simples entity.property
    const simplePropMatch = selectorStr.match(/=>\s*\w+\.(\w+)/);
    if (simplePropMatch && simplePropMatch[1]) {
      return {
        tableAlias: this.alias,
        columnName: simplePropMatch[1],
      };
    }

    // Fallback para casos não identificados
    return {
      tableAlias: this.alias,
      columnName: 'id',
    };
  }

  /**
   * Adds a JOIN clause to the query
   * @param target The target table to join with
   * @param sourceKeySelector Function to select the key from the source table
   * @param targetKeySelector Function to select the key from the target table
   * @param resultSelector Function to combine the source and target records
   * @param joinType The type of join to perform
   */

  join<U, TResult>(
    target: DbSet<U>,
    sourceKeySelector: JoinKeySelector<T>,
    targetKeySelector: JoinKeySelector<U>,
    resultSelector: JoinResultSelector<T, U, TResult>,
    joinType: JoinType = JoinType.INNER,
  ): Queryable<TResult> {
    // Criar um novo queryable com o novo tipo de resultado
    const newQueryable = this.cloneWithNewType<TResult>();

    // Obter informações da tabela alvo
    const targetTableName = target.getTableName();
    const targetAlias = target.getAlias();

    // Registrar a tabela alvo no rastreador de propriedades
    newQueryable.propertyTracker.registerTable(targetTableName, targetAlias);

    // Criar a expressão da tabela alvo
    const targetTable = this.expressionBuilder.createTable(targetTableName, targetAlias);

    // Extrair nomes de parâmetros da função resultSelector
    const resultSelectorStr = resultSelector.toString();
    const paramMatch = resultSelectorStr.match(/\(\s*(\w+)\s*,\s*(\w+)(?:\s*,\s*\w+)?\s*\)\s*=>/);
    const sourceParamName = paramMatch ? paramMatch[1] : 'source';
    const targetParamName = paramMatch ? paramMatch[2] : 'target';

    // Processar o sourceKeySelector para entender a origem da propriedade
    const sourceKeyInfo = this.processNestedJoinKey<T>(sourceKeySelector);

    // Analisar o targetKeySelector para extrair a propriedade
    const targetSelectorStr = targetKeySelector.toString();
    const targetPropMatch = targetSelectorStr.match(/=>\s*\w+\.(\w+)/);
    const targetKeyInfo = {
      tableAlias: targetAlias,
      columnName: targetPropMatch && targetPropMatch[1] ? targetPropMatch[1] : 'id',
    };

    // Criar as expressões de coluna para a junção
    const sourceColumn = this.expressionBuilder.createColumn(
      sourceKeyInfo.columnName,
      sourceKeyInfo.tableAlias,
    );
    const targetColumn = this.expressionBuilder.createColumn(
      targetKeyInfo.columnName,
      targetKeyInfo.tableAlias,
    );

    // Criar a condição de junção
    const joinCondition = this.expressionBuilder.createEqual(sourceColumn, targetColumn);

    // Criar a expressão de junção
    const joinExpr = this.expressionBuilder.createJoin(targetTable, joinCondition, joinType);

    // Adicionar a junção à consulta
    newQueryable.joins.push(joinExpr);

    // Analisar o resultSelector para registrar propriedades no rastreador
    this.processResultSelectorForJoin(
      resultSelectorStr,
      sourceParamName,
      targetParamName,
      this.alias,
      targetAlias,
      newQueryable.propertyTracker,
    );

    return newQueryable;
  }

  /**
   * Processa o resultSelector de uma junção para registrar propriedades no rastreador
   * @param resultSelectorStr String da função resultSelector
   * @param sourceParamName Nome do parâmetro de origem
   * @param targetParamName Nome do parâmetro de destino
   * @param sourceTableAlias Alias da tabela de origem
   * @param targetTableAlias Alias da tabela de destino
   * @param propertyTracker Rastreador de propriedades a ser atualizado
   */
  private processResultSelectorForJoin(
    resultSelectorStr: string,
    sourceParamName: string,
    targetParamName: string,
    sourceTableAlias: string,
    targetTableAlias: string,
    propertyTracker: PropertyTracker,
  ): void {
    try {
      // Extrair o objeto literal retornado pelo resultSelector
      const objectLiteralMatch = resultSelectorStr.match(/\{([^}]*)\}/);

      if (objectLiteralMatch && objectLiteralMatch[1]) {
        const objectContent = objectLiteralMatch[1];

        // Procurar atribuições de propriedades
        const propAssignments = objectContent.split(',').map(s => s.trim());

        for (const assignment of propAssignments) {
          // Exemplo: "user: user" ou "order: order" ou "userId: user.id" ou "orderAmount: order.amount"
          if (assignment.includes(':')) {
            // Caso com atribuição explícita: prop: value
            const parts = assignment.split(':').map(s => s.trim());
            const propName = parts[0];
            const propValue = parts[1];

            // Verificar se é uma referência direta a um parâmetro
            if (propValue === sourceParamName) {
              // Caso como "user: user" - referência ao objeto completo
              propertyTracker.registerProperty(propName, sourceTableAlias, '*', [propName]);
              // Registrar um wildcard para permitir rastreamento de propriedades aninhadas
              propertyTracker.registerProperty(`${propName}.*`, sourceTableAlias, '*', [
                propName,
                '*',
              ]);
            } else if (propValue === targetParamName) {
              // Caso como "order: order" - referência ao objeto completo
              propertyTracker.registerProperty(propName, targetTableAlias, '*', [propName]);
              // Registrar um wildcard para propriedades aninhadas
              propertyTracker.registerProperty(`${propName}.*`, targetTableAlias, '*', [
                propName,
                '*',
              ]);
            } else if (propValue.startsWith(`${sourceParamName}.`)) {
              // Caso como "userId: user.id" ou "order: joined.order"
              const propertyPath = propValue; // Caminho completo da propriedade (ex: joined.order)
              const propertyOrigin = propertyTracker.getPropertySource(propertyPath);

              if (propertyOrigin) {
                propertyTracker.registerProperty(
                  propName,
                  propertyOrigin.tableAlias,
                  propertyOrigin.columnName,
                );
              }
            } else if (propValue.startsWith(`${targetParamName}.`)) {
              // Caso como "uniProp: uni.algumaCoisa"
              const propertyPath = propValue;
              const propertyOrigin = propertyTracker.getPropertySource(propertyPath);

              if (propertyOrigin) {
                propertyTracker.registerProperty(
                  propName,
                  propertyOrigin.tableAlias,
                  propertyOrigin.columnName,
                );
              }
            }
          } else if (assignment === sourceParamName) {
            // Shorthand para o objeto fonte (ex: apenas "user")
            propertyTracker.registerProperty(sourceParamName, sourceTableAlias, '*', [
              sourceParamName,
            ]);
            propertyTracker.registerProperty(`${sourceParamName}.*`, sourceTableAlias, '*', [
              sourceParamName,
              '*',
            ]);
          } else if (assignment === targetParamName) {
            // Shorthand para o objeto alvo (ex: apenas "order")
            propertyTracker.registerProperty(targetParamName, targetTableAlias, '*', [
              targetParamName,
            ]);
            propertyTracker.registerProperty(`${targetParamName}.*`, targetTableAlias, '*', [
              targetParamName,
              '*',
            ]);
          } else if (assignment.match(/^\w+$/)) {
            // Outro shorthand property
            propertyTracker.registerProperty(assignment, targetTableAlias, assignment);
          }
          // Caso especial: spread operator ...joined
          else if (assignment.startsWith('...')) {
            const spreadParam = assignment.substring(3);

            // Iterar pelas propriedades já rastreadas que pertencem ao objeto spreadParam
            for (const [registeredPropertyName, propertySource] of propertyTracker
              .getAllPropertySources()
              .entries()) {
              if (registeredPropertyName.startsWith(`${spreadParam}.`)) {
                // Extrair o nome da propriedade sem o prefixo do spreadParam
                const actualPropertyName = registeredPropertyName.substring(spreadParam.length + 1);

                // Registrar a propriedade com sua origem original
                propertyTracker.registerProperty(
                  actualPropertyName,
                  propertySource.tableAlias,
                  propertySource.columnName,
                  propertySource.propertyPath,
                );
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Erro ao analisar resultSelector:', error);
    }
  }
  /**
   * Extrai informações da chave de junção a partir da string do seletor
   */
  private extractJoinKeyInfo(
    selectorStr: string,
    defaultTableAlias: string,
  ): { propertyName: string; tableAlias: string; path?: string[] } {
    // Para propriedades simples: entity => entity.id
    const simplePropMatch = selectorStr.match(/=>\s*\w+\.(\w+)/);
    if (simplePropMatch && simplePropMatch[1]) {
      return {
        propertyName: simplePropMatch[1],
        tableAlias: defaultTableAlias,
      };
    }

    // Para propriedades aninhadas: joined => joined.order.id
    const nestedPropMatch = selectorStr.match(/=>\s*(\w+)(?:\.(\w+))+$/);
    if (nestedPropMatch) {
      const fullPath = selectorStr.match(/=>\s*(\w+(?:\.\w+)+)$/)?.[1];
      if (fullPath) {
        const pathParts = fullPath.split('.');
        const paramName = pathParts[0];
        const lastProperty = pathParts[pathParts.length - 1];

        // Verificar se temos uma origem para o objeto aninhado
        if (this.propertyTracker) {
          // Verificar primeiro o objeto direto (ex: joined.order)
          if (pathParts.length >= 2) {
            const objPath = `${pathParts[1]}.*`;
            const source = this.propertyTracker.getPropertySource(objPath);

            if (source) {
              return {
                propertyName: lastProperty,
                tableAlias: source.tableAlias,
                path: pathParts.slice(1),
              };
            }

            // Tentar o objeto direto sem wildcard
            const objSource = this.propertyTracker.getPropertySource(pathParts[1]);
            if (objSource) {
              return {
                propertyName: lastProperty,
                tableAlias: objSource.tableAlias,
                path: pathParts.slice(1),
              };
            }
          }
        }

        // Fallback - usar o alias padrão
        return {
          propertyName: lastProperty,
          tableAlias: defaultTableAlias,
          path: pathParts.slice(1),
        };
      }
    }

    // Fallback para casos não reconhecidos
    return {
      propertyName: 'id', // Nome genérico
      tableAlias: defaultTableAlias,
    };
  }

  /**
   * Adds an ORDER BY clause to the query
   * @param selector Function to select the ordering field
   * @param direction The sort direction
   */
  orderBy(
    selector: OrderBySelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Obter a string da função seletora para análise
    const selectorStr = selector.toString();

    // Usar o método genérico para resolver a propriedade, incluindo aninhamentos
    const propertyInfo = this.resolvePropertyPath(selectorStr, this.alias);

    // Criar uma expressão de coluna com o alias correto
    const column = this.expressionBuilder.createColumn(
      propertyInfo.columnName,
      propertyInfo.tableAlias,
    );

    // Criar a expressão ORDER BY
    const orderByExpr = this.expressionBuilder.createOrderBy(
      column,
      direction === OrderDirection.ASC,
    );

    // Adicionar o ORDER BY à consulta
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  /**
   * Adds a GROUP BY clause to the query
   * @param selector Function to select the grouping fields
   */
  groupBy(selector: GroupBySelector<T>): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Para groupBy podemos receber um array de colunas
    const fnStr = selector.toString();

    // Tentar extrair propriedades do literal de array
    const propertiesMatch = fnStr.match(/\[\s*\w+\.(\w+)(?:\s*,\s*\w+\.(\w+))*\s*\]/);

    if (propertiesMatch) {
      // Processar todos os grupos capturados que podem conter nomes de propriedades
      for (let i = 1; i < propertiesMatch.length; i++) {
        if (propertiesMatch[i]) {
          const propName = propertiesMatch[i];

          // Verificar se temos uma origem para essa propriedade
          const propSource = this.propertyTracker.getPropertySource(propName);
          const tableAlias = propSource ? propSource.tableAlias : this.alias;

          const column = this.expressionBuilder.createColumn(propName, tableAlias);
          newQueryable.groupByColumns.push(column);
        }
      }
    } else {
      // Lidar com o caso de propriedade única
      const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);
      if (propertyMatch && propertyMatch[1]) {
        const propName = propertyMatch[1];

        // Verificar se temos uma origem para essa propriedade
        const propSource = this.propertyTracker.getPropertySource(propName);
        const tableAlias = propSource ? propSource.tableAlias : this.alias;

        const column = this.expressionBuilder.createColumn(propName, tableAlias);
        newQueryable.groupByColumns.push(column);
      } else {
        throw new Error(`Não foi possível extrair propriedades do seletor de groupBy: ${fnStr}`);
      }
    }

    return newQueryable;
  }

  /**
   * Adds a HAVING clause to the query
   * @param predicate The predicate function
   */
  having(predicate: PredicateFunction<T>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Parse the predicate into an expression
    const predicateExpr = this.lambdaParser.parsePredicate<T>(predicate, this.alias);

    // If there's already a having clause, AND it with the new one
    if (newQueryable.havingClause) {
      newQueryable.havingClause = this.expressionBuilder.createAnd(
        newQueryable.havingClause,
        predicateExpr,
      );
    } else {
      newQueryable.havingClause = predicateExpr;
    }

    return newQueryable;
  }

  /**
   * Adds a LIMIT clause to the query
   * @param count The maximum number of records to return
   */
  limit(count: number): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Set the limit value
    newQueryable.limitValue = this.expressionBuilder.createConstant(count);

    return newQueryable;
  }

  /**
   * Adds an OFFSET clause to the query
   * @param offset The number of records to skip
   */
  offset(offset: number): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Set the offset value
    newQueryable.offsetValue = this.expressionBuilder.createConstant(offset);

    return newQueryable;
  }

  /**
   * Sets the query to return distinct results
   */
  distinct(): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Set the distinct flag
    newQueryable.isDistinct = true;

    return newQueryable;
  }

  /**
   * Counts the number of records
   * @param selector Optional selector for the column to count
   */
  count<TResult = number>(selector?: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // If a selector is provided, parse it
    let countExpr: Expression | null = null;

    if (selector) {
      // Extract the column name
      const fnStr = selector.toString();
      const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);

      if (propertyMatch && propertyMatch[1]) {
        countExpr = this.expressionBuilder.createColumn(propertyMatch[1], this.alias);
      } else {
        throw new Error(`Could not extract property from count selector: ${fnStr}`);
      }
    }

    // Create the COUNT function
    const countFunc = this.expressionBuilder.createCount(countExpr);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(countFunc, 'count')];

    return newQueryable;
  }

  /**
   * Gets the maximum value of a column
   * @param selector Function to select the column
   */
  max<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Extract the column name
    const fnStr = selector.toString();
    const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);

    if (!propertyMatch || !propertyMatch[1]) {
      throw new Error(`Could not extract property from max selector: ${fnStr}`);
    }

    // Create column expression
    const column = this.expressionBuilder.createColumn(propertyMatch[1], this.alias);

    // Create the MAX function
    const maxFunc = this.expressionBuilder.createMax(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(maxFunc, 'max')];

    return newQueryable;
  }

  /**
   * Gets the minimum value of a column
   * @param selector Function to select the column
   */
  min<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into an expression
    const selectorExpr = this.lambdaParser.parsePredicate<T>(
      entity => selector(entity) !== null,
      this.alias,
    );

    // Extract the column expression from the condition
    let column: Expression | null = null;

    if (selectorExpr instanceof BinaryExpression) {
      // The left side should be a column expression
      column = selectorExpr.getLeft();
    } else {
      // Use the selector expression itself
      column = selectorExpr;
    }

    // Create the MIN function
    const minFunc = this.expressionBuilder.createMin(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(minFunc, 'min')];

    return newQueryable;
  }

  /**
   * Gets the sum of values in a column
   * @param selector Function to select the column
   */
  sum<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into an expression
    const selectorExpr = this.lambdaParser.parsePredicate<T>(
      entity => selector(entity) !== null,
      this.alias,
    );

    // Extract the column expression from the condition
    let column: Expression | null = null;

    if (selectorExpr instanceof BinaryExpression) {
      // The left side should be a column expression
      column = selectorExpr.getLeft();
    } else {
      // Use the selector expression itself
      column = selectorExpr;
    }

    // Create the SUM function
    const sumFunc = this.expressionBuilder.createSum(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(sumFunc, 'sum')];

    return newQueryable;
  }

  /**
   * Gets the average value of a column
   * @param selector Function to select the column
   */
  avg<TResult>(selector: AggregateSelector<T>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into an expression
    const selectorExpr = this.lambdaParser.parsePredicate<T>(
      entity => selector(entity) !== null,
      this.alias,
    );

    // Extract the column expression from the condition
    let column: Expression | null = null;

    if (selectorExpr instanceof BinaryExpression) {
      // The left side should be a column expression
      column = selectorExpr.getLeft();
    } else {
      // Use the selector expression itself
      column = selectorExpr;
    }

    // Create the AVG function
    const avgFunc = this.expressionBuilder.createAvg(column);

    // Add the projection
    newQueryable.projections = [this.expressionBuilder.createProjection(avgFunc, 'avg')];

    return newQueryable;
  }

  /**
   * Converts the query to a SQL string
   */
  toQueryString(): string {
    // Create the SELECT expression
    const selectExpr = this.expressionBuilder.createSelect(
      this.projections,
      this.fromTable,
      this.joins,
      this.whereClause,
      this.groupByColumns,
      this.havingClause,
      this.orderByColumns,
      this.limitValue,
      this.offsetValue,
      this.isDistinct,
    );

    // Create a SQL visitor
    const visitor = new SqlGenerationVisitor();

    // Generate the SQL
    const sql = selectExpr.accept(visitor);

    // Format the SQL
    return formatSQLClientStyle(sql);
  }

  /**
   * Creates a clone of this queryable
   */
  private clone(): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = new Queryable<T>(
      this.tableName,
      this.alias,
      this.contextVariables,
      this.propertyTracker.clone(),
    );

    // Copiar todos os componentes da consulta
    newQueryable.fromTable = this.fromTable;
    newQueryable.whereClause = this.whereClause;
    newQueryable.projections = [...this.projections];
    newQueryable.joins = [...this.joins];
    newQueryable.groupByColumns = [...this.groupByColumns];
    newQueryable.havingClause = this.havingClause;
    newQueryable.orderByColumns = [...this.orderByColumns];
    newQueryable.limitValue = this.limitValue;
    newQueryable.offsetValue = this.offsetValue;
    newQueryable.isDistinct = this.isDistinct;

    return newQueryable;
  }

  /**
   * Creates a clone of this queryable with a new result type
   */
  private cloneWithNewType<TResult>(): Queryable<TResult> {
    // Criar um novo queryable
    const newQueryable = new Queryable<TResult>(
      this.tableName,
      this.alias,
      this.contextVariables,
      this.propertyTracker.clone(),
    );

    // Copiar todos os componentes da consulta
    newQueryable.fromTable = this.fromTable;
    newQueryable.whereClause = this.whereClause;
    newQueryable.projections = [...this.projections];
    newQueryable.joins = [...this.joins];
    newQueryable.groupByColumns = [...this.groupByColumns];
    newQueryable.havingClause = this.havingClause;
    newQueryable.orderByColumns = [...this.orderByColumns];
    newQueryable.limitValue = this.limitValue;
    newQueryable.offsetValue = this.offsetValue;
    newQueryable.isDistinct = this.isDistinct;

    return newQueryable;
  }

  /**
   * Esta função aprimorada processa o resultSelector de uma junção para rastrear
   * adequadamente propriedades aninhadas, como joined.order.amount
   */
  private processJoinResultSelector(
    resultSelectorStr: string,
    sourceTableAlias: string,
    targetTableAlias: string,
    sourceName: string,
    targetName: string,
  ): Map<string, { tableAlias: string; path: string[] }> {
    const resultMap = new Map<string, { tableAlias: string; path: string[] }>();

    try {
      // Extrair o objeto literal retornado pelo resultSelector
      const objectLiteralMatch = resultSelectorStr.match(/\{([^}]*)\}/);

      if (objectLiteralMatch && objectLiteralMatch[1]) {
        const objectContent = objectLiteralMatch[1];

        // Procurar atribuições de propriedades
        const propAssignments = objectContent.split(',').map(s => s.trim());

        for (const assignment of propAssignments) {
          // Exemplo: "user: user" ou "order: order" ou "userId: user.id" ou "orderAmount: order.amount"
          if (assignment.includes(':')) {
            // Caso com atribuição explícita: prop: value
            const parts = assignment.split(':').map(s => s.trim());
            const propName = parts[0];
            const propValue = parts[1];

            // Verificar se é uma referência direta a um parâmetro
            if (propValue === sourceName) {
              // Caso como "user: user" - referência ao objeto completo
              resultMap.set(propName, { tableAlias: sourceTableAlias, path: [propName] });

              // Registramos também que todas as propriedades deste objeto pertencem à tabela fonte
              // Isso permitirá rastrear algo como "joined.user.name" mais tarde
              resultMap.set(`${propName}.*`, {
                tableAlias: sourceTableAlias,
                path: [propName, '*'],
              });
            } else if (propValue === targetName) {
              // Caso como "order: order" - referência ao objeto completo
              resultMap.set(propName, { tableAlias: targetTableAlias, path: [propName] });

              // Similar ao anterior, para permitir rastrear "joined.order.amount"
              resultMap.set(`${propName}.*`, {
                tableAlias: targetTableAlias,
                path: [propName, '*'],
              });
            } else if (propValue.startsWith(`${sourceName}.`)) {
              // Caso como "userId: user.id"
              const fieldName = propValue.substring(sourceName.length + 1);
              resultMap.set(propName, { tableAlias: sourceTableAlias, path: [propName] });
            } else if (propValue.startsWith(`${targetName}.`)) {
              // Caso como "orderAmount: order.amount"
              const fieldName = propValue.substring(targetName.length + 1);
              resultMap.set(propName, { tableAlias: targetTableAlias, path: [propName] });
            }
          } else if (assignment.match(/^\w+$/)) {
            // Shorthand property (como "user" significando "user: user")
            const propName = assignment;

            if (propName === sourceName) {
              resultMap.set(propName, { tableAlias: sourceTableAlias, path: [propName] });
              resultMap.set(`${propName}.*`, {
                tableAlias: sourceTableAlias,
                path: [propName, '*'],
              });
            } else if (propName === targetName) {
              resultMap.set(propName, { tableAlias: targetTableAlias, path: [propName] });
              resultMap.set(`${propName}.*`, {
                tableAlias: targetTableAlias,
                path: [propName, '*'],
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn('Erro ao analisar resultSelector:', error);
    }

    return resultMap;
  }

  /**
   * Método genérico para resolver o caminho de uma propriedade aninhada
   * Este método pode ser usado por todos os métodos que lidam com expressões lambda
   * (join, select, where, orderBy, groupBy, etc.)
   *
   * @param selectorStr String da função seletora (ex: "joined => joined.order.amount")
   * @param defaultTableAlias Alias padrão a ser usado se não for possível determinar
   * @returns Informações da propriedade resolvida
   */
  protected resolvePropertyPath(
    selectorStr: string,
    defaultTableAlias: string,
  ): { tableAlias: string; columnName: string; path?: string[] } {
    // Para propriedades aninhadas como: joined => joined.order.amount
    const nestedPropMatch = selectorStr.match(/=>\s*\w+\.(\w+)\.(\w+)/);

    if (nestedPropMatch && nestedPropMatch[1] && nestedPropMatch[2]) {
      const objectName = nestedPropMatch[1]; // "order"
      const propertyName = nestedPropMatch[2]; // "amount"

      // Extrair o caminho completo para rastreamento
      const fullPathMatch = selectorStr.match(/=>\s*(\w+(?:\.\w+)+)/);
      const fullPath = fullPathMatch ? fullPathMatch[1].split('.') : [objectName, propertyName];

      // Tentar encontrar a tabela correta no rastreador de propriedades
      if (this.propertyTracker) {
        // Verificar registros diretos do objeto
        const objectSource = this.propertyTracker.getPropertySource(objectName);
        if (objectSource) {
          return {
            tableAlias: objectSource.tableAlias,
            columnName: propertyName,
            path: fullPath,
          };
        }

        // Verificar wildcards registrados
        const wildcardKey = `${objectName}.*`;
        const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
        if (wildcardSource) {
          return {
            tableAlias: wildcardSource.tableAlias,
            columnName: propertyName,
            path: fullPath,
          };
        }

        // Verificar se alguma propriedade registrada contém este objeto no caminho
        for (const [propName, source] of this.propertyTracker.getAllPropertySources().entries()) {
          if (
            propName === objectName ||
            (source.propertyPath && source.propertyPath.includes(objectName))
          ) {
            return {
              tableAlias: source.tableAlias,
              columnName: propertyName,
              path: fullPath,
            };
          }
        }

        // Verificar correspondência com aliases de tabela
        for (const alias of this.propertyTracker.getTableAliases()) {
          // Correspondência exata ou primeira letra
          if (alias === objectName || objectName.charAt(0).toLowerCase() === alias.toLowerCase()) {
            return {
              tableAlias: alias,
              columnName: propertyName,
              path: fullPath,
            };
          }
        }
      }
    }

    // Para propriedades simples: entity => entity.property
    const simplePropMatch = selectorStr.match(/=>\s*\w+\.(\w+)/);
    if (simplePropMatch && simplePropMatch[1]) {
      return {
        tableAlias: defaultTableAlias,
        columnName: simplePropMatch[1],
      };
    }

    // Fallback para casos não identificados
    return {
      tableAlias: defaultTableAlias,
      columnName: 'id',
    };
  }

  /**
   * Extrai propriedades aninhadas de uma string de expressão
   * @param exprStr String da expressão a ser analisada
   * @returns Lista de propriedades aninhadas encontradas
   */
  private extractNestedProperties(exprStr: string): Array<{
    fullPath: string;
    objectName: string;
    propertyName: string;
  }> {
    const result: Array<{
      fullPath: string;
      objectName: string;
      propertyName: string;
    }> = [];

    // Expressão regular para encontrar padrões como "joined.order.amount"
    const regex = /(\w+)\.(\w+)\.(\w+)/g;
    let match;

    // Extrair o parâmetro da função lambda primeiro
    const paramMatch = exprStr.match(/\(\s*(\w+)\s*\)\s*=>|\s*(\w+)\s*=>/);
    const paramName = paramMatch ? paramMatch[1] || paramMatch[2] : 'entity';

    while ((match = regex.exec(exprStr)) !== null) {
      const [fullPath, firstPart, objectName, propertyName] = match;

      // Verificar se a primeira parte corresponde ao parâmetro da função
      if (firstPart === paramName) {
        result.push({
          fullPath,
          objectName,
          propertyName,
        });
      }
    }

    return result;
  }
  /**
   * Substitui uma propriedade aninhada em uma expressão
   * @param expr Expressão onde a substituição deve ser feita
   * @param fullPath Caminho completo da propriedade (ex: "joined.order.amount")
   * @param objectName Nome do objeto intermediário (ex: "order")
   * @param propertyName Nome da propriedade final (ex: "amount")
   * @returns Expressão com a propriedade aninhada substituída
   */
  private replaceNestedPropertyInExpression(
    expr: Expression,
    fullPath: string,
    objectName: string,
    propertyName: string,
  ): Expression {
    // Se a expressão é uma expressão binária, processar seus operandos
    if (expr instanceof BinaryExpression) {
      const left = this.replaceNestedPropertyInExpression(
        expr.getLeft(),
        fullPath,
        objectName,
        propertyName,
      );

      const right = this.replaceNestedPropertyInExpression(
        expr.getRight(),
        fullPath,
        objectName,
        propertyName,
      );

      return this.expressionBuilder.createBinary(expr.getOperatorType(), left, right);
    }

    // Se a expressão é uma expressão de coluna que corresponde à nossa busca
    if (expr instanceof ColumnExpression) {
      const columnName = expr.getColumnName();

      // Verificar se esta coluna corresponde à propriedade aninhada
      // Isso é uma heurística simples - na prática, precisaríamos de uma análise mais sofisticada
      // if (columnName === propertyName) {
      //   // Tentar resolver a tabela correta para o objeto intermediário
      //   const resolvedInfo = this.resolvePropertyPath(
      //     `=> ${this.parameterName}.${objectName}.${propertyName}`,
      //     this.alias,
      //   );

      //   // Se conseguimos resolver, criar uma nova expressão de coluna com o alias correto
      //   if (resolvedInfo.tableAlias !== this.alias) {
      //     return this.expressionBuilder.createColumn(propertyName, resolvedInfo.tableAlias);
      //   }
      // }
    }

    // Se não é um caso que precisamos tratar, retornar a expressão original
    return expr;
  }

  toMetadata(): SelectExpression {
    return this.expressionBuilder.createSelect(
      this.projections,
      this.fromTable,
      this.joins,
      this.whereClause,
      this.groupByColumns,
      this.havingClause,
      this.orderByColumns,
      this.limitValue,
      this.offsetValue,
      this.isDistinct,
    );
  }
}
