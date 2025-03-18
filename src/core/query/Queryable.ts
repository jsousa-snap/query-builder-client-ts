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
  IDatabaseProvider,
} from './Types';

import { JoinType, JoinExpression } from '../expressions/JoinExpression';
import { OrderingExpression, SelectExpression } from '../expressions/SelectExpression';
import { ExpressionBuilder } from './ExpressionBuilder';
import { LambdaParser } from './LambdaParser';
import { SqlGenerationVisitor } from '../visitors/SqlGenerationVisitor';
import { TableExpression } from '../expressions/TableExpression';
import { Expression, ExpressionType } from '../expressions/Expression';
import { ProjectionExpression } from '../expressions/ProjectionExpression';
import { ColumnExpression } from '../expressions/ColumnExpression';
import { BinaryExpression } from '../expressions/BinaryExpression';
import { formatSQLClientStyle } from '../../utils/SqlFormatter';
import { PropertyTracker } from './PropertyTracker';
import { ScalarSubqueryExpression } from '../expressions/ScalarSubqueryExpression';
import { ExpressionSerializer } from '../../utils/ExpressionSerializer';
import { FunctionExpression } from '../expressions/FunctionExpression';
import { SqlServerGenerationVisitor } from '../visitors/SqlServerGenerationVisitor';

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
  private orderByColumns: OrderingExpression[] = [];
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
    private readonly provider: IDatabaseProvider,
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
      this.provider,
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
    // Create a new queryable
    const newQueryable = this.clone();

    try {
      // Create a lambda parser with property tracking information
      const enhancedParser = new LambdaParser(
        this.expressionBuilder,
        this.contextVariables,
        this.propertyTracker,
      );

      // Attempt to parse with enhanced nested property support
      const predicateExpr = enhancedParser.parsePredicateWithNesting<T>(predicate, this.alias);

      // If there's already a where clause, AND it with the new one
      if (newQueryable.whereClause) {
        newQueryable.whereClause = this.expressionBuilder.createAnd(
          newQueryable.whereClause,
          predicateExpr,
        );
      } else {
        newQueryable.whereClause = predicateExpr;
      }
    } catch (err) {
      console.warn(
        'Error processing predicate with enhanced parser, falling back to standard method:',
        err,
      );

      // Fallback to standard parsing method
      const predicateExpr = this.lambdaParser.parsePredicate<T>(predicate, this.alias);

      if (newQueryable.whereClause) {
        newQueryable.whereClause = this.expressionBuilder.createAnd(
          newQueryable.whereClause,
          predicateExpr,
        );
      } else {
        newQueryable.whereClause = predicateExpr;
      }
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

  /**
   * Adds a SELECT clause to the query
   * @param selector The selector function
   */
  select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult> {
    // Salvar as projeções existentes que são subconsultas
    const existingSubqueries = this.projections.filter(p => {
      const expr = p.getExpression();
      try {
        return expr instanceof ScalarSubqueryExpression;
      } catch {
        return false;
      }
    });

    // Criar um novo queryable com o novo tipo de resultado
    const newQueryable = this.cloneWithNewType<TResult>();

    try {
      // Criar um LambdaParser com rastreamento de propriedades
      const lambdaParser = new LambdaParser(
        this.expressionBuilder,
        this.contextVariables,
        this.propertyTracker,
      );

      // Analisar a string da função lambda em AST
      const selectorStr = selector.toString();
      const node = lambdaParser.parseLambda(selectorStr);

      // Verificar se o selector é uma expressão simples (não é um objeto literal)
      if (!lambdaParser.isObjectLiteral(node)) {
        // É uma expressão simples (user => user.id ou _ => 1)
        const expression = lambdaParser.processSimpleExpression(node, this.alias);

        // Criar uma única projeção com alias "value"
        newQueryable.projections = [this.expressionBuilder.createProjection(expression, 'value')];

        // Se for um acesso de coluna, registrar no rastreador
        if (expression instanceof ColumnExpression) {
          newQueryable.propertyTracker.registerProperty(
            'value',
            expression.getTableAlias(),
            expression.getColumnName(),
          );
        }

        // Adicionar as subconsultas existentes de volta
        newQueryable.projections.push(...existingSubqueries);

        return newQueryable;
      }

      // Abordagem principal: usar o LambdaParser melhorado para objetos literais
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

  join<U = T, TResult = T>(
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

    // Use the enhanced LambdaParser to correctly handle nested properties
    const enhancedParser = new LambdaParser(
      this.expressionBuilder,
      this.contextVariables,
      this.propertyTracker,
    );

    // Parse the selector with nested property support
    const column = enhancedParser.parseAggregationSelector<T>(selector, this.alias);

    // Create the ORDER BY expression
    const orderByExpr = this.expressionBuilder.createOrderBy(
      column,
      direction === OrderDirection.ASC,
    );

    // Add the ORDER BY to the query
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  /**
   * Ordena os resultados pela contagem de registros em cada grupo
   * @param direction Direção da ordenação (ASC ou DESC)
   */
  orderByCount<TResult = T>(direction: OrderDirection = OrderDirection.ASC): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Criar a expressão COUNT(*)
    const countExpr = this.expressionBuilder.createCount(null);

    // Criar a expressão de ordenação
    const orderByExpr = this.expressionBuilder.createOrderBy(
      countExpr,
      direction === OrderDirection.ASC,
    );

    // Adicionar à lista de ordenações
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  /**
   * Ordena os resultados pela média de valores em uma coluna
   * @param selector Função para selecionar a coluna
   * @param direction Direção da ordenação (ASC ou DESC)
   */
  orderByAvg<R = T>(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Extrair a propriedade do seletor
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Não foi possível extrair a propriedade do seletor: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determinar a tabela e coluna corretas
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Criar a expressão de coluna
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Criar a expressão AVG
    const avgExpr = this.expressionBuilder.createAvg(column);

    // Criar a expressão de ordenação
    const orderByExpr = this.expressionBuilder.createOrderBy(
      avgExpr,
      direction === OrderDirection.ASC,
    );

    // Adicionar à lista de ordenações
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  /**
   * Ordena os resultados pela soma de valores em uma coluna
   * @param selector Função para selecionar a coluna
   * @param direction Direção da ordenação (ASC ou DESC)
   */
  orderBySum<R = T>(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Extrair a propriedade do seletor
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Não foi possível extrair a propriedade do seletor: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determinar a tabela e coluna corretas
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Criar a expressão de coluna
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Criar a expressão SUM
    const sumExpr = this.expressionBuilder.createSum(column);

    // Criar a expressão de ordenação
    const orderByExpr = this.expressionBuilder.createOrderBy(
      sumExpr,
      direction === OrderDirection.ASC,
    );

    // Adicionar à lista de ordenações
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  /**
   * Ordena os resultados pelo valor mínimo em uma coluna
   * @param selector Função para selecionar a coluna
   * @param direction Direção da ordenação (ASC ou DESC)
   */
  orderByMin<R = T>(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Extrair a propriedade do seletor
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Não foi possível extrair a propriedade do seletor: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determinar a tabela e coluna corretas
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Criar a expressão de coluna
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Criar a expressão MIN
    const minExpr = this.expressionBuilder.createMin(column);

    // Criar a expressão de ordenação
    const orderByExpr = this.expressionBuilder.createOrderBy(
      minExpr,
      direction === OrderDirection.ASC,
    );

    // Adicionar à lista de ordenações
    newQueryable.orderByColumns.push(orderByExpr);

    return newQueryable;
  }

  /**
   * Ordena os resultados pelo valor máximo em uma coluna
   * @param selector Função para selecionar a coluna
   * @param direction Direção da ordenação (ASC ou DESC)
   */
  orderByMax<R = T>(
    selector: AggregateSelector<T>,
    direction: OrderDirection = OrderDirection.ASC,
  ): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Extrair a propriedade do seletor
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Não foi possível extrair a propriedade do seletor: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determinar a tabela e coluna corretas
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Criar a expressão de coluna
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Criar a expressão MAX
    const maxExpr = this.expressionBuilder.createMax(column);

    // Criar a expressão de ordenação
    const orderByExpr = this.expressionBuilder.createOrderBy(
      maxExpr,
      direction === OrderDirection.ASC,
    );

    // Adicionar à lista de ordenações
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

    // Get the selector function string
    const selectorStr = selector.toString();

    // Try to detect if it's returning an array
    const isArraySelector = selectorStr.includes('[') && selectorStr.includes(']');

    if (isArraySelector) {
      // Parse the array contents - this is a more complex case
      // Look for patterns like [entity.prop1, entity.prop2] or [entity.obj.prop1, entity.prop2]
      const properties = this.extractPropertiesFromArray(selectorStr);

      for (const prop of properties) {
        if (prop.isNested) {
          // Handle nested property
          // Try to find the correct table alias
          let tableAlias = this.alias;
          const objectName = prop.objectName;
          const propertyName = prop.propertyName;

          if (this.propertyTracker) {
            // Try to resolve the table alias using the same strategies as in other methods
            const objectSource = this.propertyTracker.getPropertySource(objectName);
            if (objectSource) {
              tableAlias = objectSource.tableAlias;
            } else {
              // Check wildcards
              const wildcardSource = this.propertyTracker.getPropertySource(`${objectName}.*`);
              if (wildcardSource) {
                tableAlias = wildcardSource.tableAlias;
              } else {
                // Check table aliases
                for (const alias of this.propertyTracker.getTableAliases()) {
                  if (
                    alias === objectName ||
                    objectName.charAt(0).toLowerCase() === alias.toLowerCase()
                  ) {
                    tableAlias = alias;
                    break;
                  }
                }
              }
            }
          }

          // Create and add the column expression
          const column = this.expressionBuilder.createColumn(propertyName, tableAlias);
          newQueryable.groupByColumns.push(column);
        } else {
          // Handle simple property
          const column = this.expressionBuilder.createColumn(prop.propertyName, this.alias);
          newQueryable.groupByColumns.push(column);
        }
      }
    } else {
      // Single property selector
      const enhancedParser = new LambdaParser(
        this.expressionBuilder,
        this.contextVariables,
        this.propertyTracker,
      );

      // Parse the selector with support for nested properties
      const column = enhancedParser.parseAggregationSelector<T>(selector as any, this.alias);
      newQueryable.groupByColumns.push(column);
    }

    return newQueryable;
  }

  /**
   * Adds a HAVING clause to the query
   * @param predicate The predicate function
   */
  having(predicate: PredicateFunction<any>): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Extract the predicate string for pattern matching
    const predicateStr = predicate.toString();

    // Check for aggregate patterns like g.count > 5
    const aggregatePattern = /(\w+)\.(count|sum|avg|min|max)\s*([><=!]+)\s*(\d+)/i;
    const aggregateMatch = predicateStr.match(aggregatePattern);

    if (aggregateMatch) {
      // We found an aggregate comparison pattern
      const [_, paramName, aggFunction, operator, value] = aggregateMatch;

      // Map the operator string to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the appropriate function expression
      let aggExpr: Expression;
      switch (aggFunction.toUpperCase()) {
        case 'COUNT':
          aggExpr = this.expressionBuilder.createCount(null);
          break;
        case 'SUM':
          // Try to determine which column to sum based on projections
          const sumColumn = this.findColumnForAggregate('SUM');
          aggExpr = this.expressionBuilder.createSum(sumColumn);
          break;
        case 'AVG':
          const avgColumn = this.findColumnForAggregate('AVG');
          aggExpr = this.expressionBuilder.createAvg(avgColumn);
          break;
        case 'MIN':
          const minColumn = this.findColumnForAggregate('MIN');
          aggExpr = this.expressionBuilder.createMin(minColumn);
          break;
        case 'MAX':
          const maxColumn = this.findColumnForAggregate('MAX');
          aggExpr = this.expressionBuilder.createMax(maxColumn);
          break;
        default:
          throw new Error(`Unsupported aggregate function: ${aggFunction}`);
      }

      // Create a constant expression for the comparison value
      const valueConst = this.expressionBuilder.createConstant(Number(value));

      // Create the binary expression for the HAVING clause
      const havingExpr = this.expressionBuilder.createBinary(exprType, aggExpr, valueConst);

      // Add to existing having clause or set as new having clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    // Check for direct column comparison patterns (g.age > 25)
    const columnPattern = /(\w+)\.(\w+)\s*([><=!]+)\s*(\d+)/i;
    const columnMatch = predicateStr.match(columnPattern);

    // Check if we're in a GROUP BY context
    const hasGroupBy = this.groupByColumns.length > 0;

    if (hasGroupBy && columnMatch) {
      // We found a simple column comparison pattern in a GROUP BY context
      const [_, paramName, columnName, operator, value] = columnMatch;

      // Map the operator string to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Find the column in group by or projections
      let tableAlias = this.alias;
      let foundInGroupBy = false;

      // Check if this column is in GROUP BY
      for (const groupByCol of this.groupByColumns) {
        if (groupByCol instanceof ColumnExpression && groupByCol.getColumnName() === columnName) {
          tableAlias = groupByCol.getTableAlias();
          foundInGroupBy = true;
          break;
        }
      }

      // If not in GROUP BY, check projections
      if (!foundInGroupBy) {
        for (const projection of this.projections) {
          if (
            projection.getAlias() === columnName &&
            projection.getExpression() instanceof ColumnExpression
          ) {
            const expr = projection.getExpression() as ColumnExpression;
            tableAlias = expr.getTableAlias();
            break;
          }
        }
      }

      // Create the column expression
      const column = this.expressionBuilder.createColumn(columnName, tableAlias);

      // If the column is not in GROUP BY, wrap it in an aggregate function
      let havingLeftExpr: Expression;
      if (foundInGroupBy) {
        havingLeftExpr = column;
      } else {
        // Determine which aggregate function to use based on context
        // Default to AVG as it's a common choice
        havingLeftExpr = this.expressionBuilder.createAvg(column);
      }

      // Create the value expression
      const valueExpr = this.expressionBuilder.createConstant(Number(value));

      // Create the complete comparison expression
      const havingExpr = this.expressionBuilder.createBinary(exprType, havingLeftExpr, valueExpr);

      // Add to existing having clause or set as new having clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    // If not a recognized pattern, try normal parsing
    try {
      // Create a lambda parser with property tracking information
      const enhancedParser = new LambdaParser(
        this.expressionBuilder,
        this.contextVariables,
        this.propertyTracker,
      );

      // Attempt to parse with enhanced support
      const predicateExpr = enhancedParser.parsePredicateWithNesting<T>(predicate, this.alias);

      // If we're in a GROUP BY context, we need to transform non-aggregated expressions
      let havingExpr = predicateExpr;
      if (hasGroupBy && predicateExpr instanceof BinaryExpression) {
        // Check if the left side is a column expression
        const left = predicateExpr.getLeft();
        const right = predicateExpr.getRight();

        if (left instanceof ColumnExpression) {
          const columnName = left.getColumnName();
          const tableAlias = left.getTableAlias();

          // Check if this column is part of GROUP BY
          let isGroupByColumn = false;
          for (const groupByCol of this.groupByColumns) {
            if (
              groupByCol instanceof ColumnExpression &&
              groupByCol.getColumnName() === columnName &&
              groupByCol.getTableAlias() === tableAlias
            ) {
              isGroupByColumn = true;
              break;
            }
          }

          // If not in GROUP BY, wrap in an aggregate function
          if (!isGroupByColumn) {
            // Use AVG as default aggregate function
            const avgExpr = this.expressionBuilder.createAvg(left);
            havingExpr = this.expressionBuilder.createBinary(
              predicateExpr.getOperatorType(),
              avgExpr,
              right,
            );
          }
        }
      }

      // If there's already a having clause, AND it with the new one
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }
    } catch (err) {
      console.warn(
        'Error processing having predicate with enhanced parser, falling back to standard method:',
        err,
      );

      // Fallback to standard parsing method
      const predicateExpr = this.lambdaParser.parsePredicate<any>(predicate, this.alias);

      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          predicateExpr,
        );
      } else {
        newQueryable.havingClause = predicateExpr;
      }
    }

    return newQueryable;
  }

  /**
   * Helper to create a HAVING clause using COUNT
   * @param predicate A function that takes the count value and returns a boolean condition
   */
  havingCount(predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Extract the comparison operator and value from the predicate string
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create COUNT(*) expression
      const countExpr = this.expressionBuilder.createCount(null);

      // Create the value constant
      const valueExpr = this.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.expressionBuilder.createBinary(exprType, countExpr, valueExpr);

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse COUNT predicate: ${predicateStr}`);
  }

  /**
   * Helper to create a HAVING clause using AVG
   * @param selector Function to select the column to average
   * @param predicate A function that takes the average value and returns a boolean condition
   */
  havingAvg(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from AVG selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the AVG function
    const avgExpr = this.expressionBuilder.createAvg(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.expressionBuilder.createBinary(exprType, avgExpr, valueExpr);

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse AVG predicate: ${predicateStr}`);
  }

  /**
   * Helper to create a HAVING clause using SUM
   * @param selector Function to select the column to sum
   * @param predicate A function that takes the sum value and returns a boolean condition
   */
  havingSum(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from SUM selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the SUM function
    const sumExpr = this.expressionBuilder.createSum(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.expressionBuilder.createBinary(exprType, sumExpr, valueExpr);

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse SUM predicate: ${predicateStr}`);
  }

  /**
   * Helper to create a HAVING clause using MIN
   * @param selector Function to select the column to find the minimum value
   * @param predicate A function that takes the min value and returns a boolean condition
   */
  havingMin(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from MIN selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the MIN function
    const minExpr = this.expressionBuilder.createMin(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.expressionBuilder.createBinary(exprType, minExpr, valueExpr);

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse MIN predicate: ${predicateStr}`);
  }

  /**
   * Helper to create a HAVING clause using MAX
   * @param selector Function to select the column to find the maximum value
   * @param predicate A function that takes the max value and returns a boolean condition
   */
  havingMax(selector: AggregateSelector<T>, predicate: (value: number) => boolean): Queryable<T> {
    // Create a new queryable
    const newQueryable = this.clone();

    // Extract the property from the selector
    const selectorStr = selector.toString();
    const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

    if (!propMatch || !propMatch[1]) {
      throw new Error(`Could not extract property from MAX selector: ${selectorStr}`);
    }

    const propName = propMatch[1];
    let tableAlias = this.alias;
    let columnName = propName;

    // Determine the correct table and column
    if (this.propertyTracker) {
      const propSource = this.propertyTracker.getPropertySource(propName);
      if (propSource) {
        tableAlias = propSource.tableAlias;
        columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
      }
    }

    // Create the column expression
    const column = this.expressionBuilder.createColumn(columnName, tableAlias);

    // Create the MAX function
    const maxExpr = this.expressionBuilder.createMax(column);

    // Extract the comparison operator and value from the predicate
    const predicateStr = predicate.toString();
    const comparisonMatch = predicateStr.match(/\(?(\w+)\)?\s*([><=!]+)\s*(\d+(?:\.\d+)?)/);

    if (comparisonMatch) {
      const [_, paramName, operator, valueStr] = comparisonMatch;
      const value = Number(valueStr);

      // Map the operator to an expression type
      let exprType: ExpressionType;
      switch (operator) {
        case '>':
          exprType = ExpressionType.GreaterThan;
          break;
        case '>=':
          exprType = ExpressionType.GreaterThanOrEqual;
          break;
        case '<':
          exprType = ExpressionType.LessThan;
          break;
        case '<=':
          exprType = ExpressionType.LessThanOrEqual;
          break;
        case '=':
        case '==':
        case '===':
          exprType = ExpressionType.Equal;
          break;
        case '!=':
        case '!==':
          exprType = ExpressionType.NotEqual;
          break;
        default:
          throw new Error(`Unsupported operator: ${operator}`);
      }

      // Create the value constant
      const valueExpr = this.expressionBuilder.createConstant(value);

      // Create the binary comparison
      const havingExpr = this.expressionBuilder.createBinary(exprType, maxExpr, valueExpr);

      // Add to existing HAVING clause or set as new HAVING clause
      if (newQueryable.havingClause) {
        newQueryable.havingClause = this.expressionBuilder.createAnd(
          newQueryable.havingClause,
          havingExpr,
        );
      } else {
        newQueryable.havingClause = havingExpr;
      }

      return newQueryable;
    }

    throw new Error(`Could not parse MAX predicate: ${predicateStr}`);
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
  count<TResult = number>(
    selector?: AggregateSelector<T>,
    alias: string = 'count',
  ): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector || null, 'COUNT', alias, !!selector);
  }

  /**
   * Gets the maximum value of a column
   * @param selector Function to select the column
   */
  max<TResult = T>(selector: AggregateSelector<T>, alias: string = 'max'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'MAX', alias);
  }

  /**
   * Gets the minimum value of a column
   * @param selector Function to select the column
   */
  min<TResult = T>(selector: AggregateSelector<T>, alias: string = 'min'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'MIN', alias);
  }

  /**
   * Gets the sum of values in a column
   * @param selector Function to select the column
   */
  sum<TResult = T>(selector: AggregateSelector<T>, alias: string = 'sum'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'SUM', alias);
  }

  /**
   * Gets the average value of a column
   * @param selector Function to select the column
   */
  avg<TResult = T>(selector: AggregateSelector<T>, alias: string = 'avg'): Queryable<TResult> {
    return this.applyAggregation<TResult>(selector, 'AVG', alias);
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
    const visitor = new SqlServerGenerationVisitor();

    // Generate the SQL
    const sql = selectExpr.accept(visitor);

    return sql;
  }

  /**
   * Creates a clone of this queryable
   */
  private clone(): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = new Queryable<T>(
      this.provider,
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
      this.provider,
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
   * Helper method to extract properties from an array selector
   * @param selectorStr The selector function as a string
   */
  private extractPropertiesFromArray(selectorStr: string): Array<{
    isNested: boolean;
    objectName?: string;
    propertyName: string;
  }> {
    const result: Array<{
      isNested: boolean;
      objectName?: string;
      propertyName: string;
    }> = [];

    // Extract the array part: everything between [ and ]
    const arrayMatch = selectorStr.match(/\[\s*(.+?)\s*\]/s);
    if (!arrayMatch || !arrayMatch[1]) return result;

    const arrayContent = arrayMatch[1];

    // Split by commas, accounting for possible nested structures
    const items = this.splitArrayItems(arrayContent);

    for (const item of items) {
      // Check for nested property: entity.object.property
      const nestedMatch = item.match(/\w+\.(\w+)\.(\w+)/);
      if (nestedMatch) {
        result.push({
          isNested: true,
          objectName: nestedMatch[1],
          propertyName: nestedMatch[2],
        });
      } else {
        // Simple property: entity.property
        const simpleMatch = item.match(/\w+\.(\w+)/);
        if (simpleMatch) {
          result.push({
            isNested: false,
            propertyName: simpleMatch[1],
          });
        }
      }
    }

    return result;
  }

  /**
   * Helper method to split array items correctly, respecting nested structures
   * @param arrayContent The content of the array
   */
  private splitArrayItems(arrayContent: string): string[] {
    const items: string[] = [];
    let currentItem = '';
    let parenCount = 0;
    let bracketCount = 0;

    for (let i = 0; i < arrayContent.length; i++) {
      const char = arrayContent[i];

      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;

      if (char === ',' && parenCount === 0 && bracketCount === 0) {
        items.push(currentItem.trim());
        currentItem = '';
      } else {
        currentItem += char;
      }
    }

    if (currentItem.trim()) {
      items.push(currentItem.trim());
    }

    return items;
  }

  /**
   * Helper method to find a column for an aggregate function in HAVING clause
   * @param aggregateType The type of aggregate function
   */
  private findColumnForAggregate(aggregateType: string): Expression {
    // First check if we have this aggregate in projections
    for (const projection of this.projections) {
      const expr = projection.getExpression();

      if (expr instanceof FunctionExpression && expr.getFunctionName() === aggregateType) {
        // Return the first argument of the function
        const args = expr.getArguments();
        if (args.length > 0) {
          return args[0];
        }
      }
    }

    // If we don't have a matching projection, try to infer from context
    // For example, if we're doing SUM and have a "total" column, use that
    if (this.groupByColumns.length > 0) {
      // Default to using the first non-GROUP BY column
      for (const projection of this.projections) {
        const expr = projection.getExpression();

        if (expr instanceof ColumnExpression) {
          // Check if this column is NOT in the GROUP BY
          const isInGroupBy = this.groupByColumns.some(groupCol => {
            if (groupCol instanceof ColumnExpression) {
              return (
                groupCol.getTableAlias() === expr.getTableAlias() &&
                groupCol.getColumnName() === expr.getColumnName()
              );
            }
            return false;
          });

          if (!isInGroupBy) {
            return expr;
          }
        }
      }
    }

    // Last resort: use a wildcard (*)
    return this.expressionBuilder.createConstant('*');
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

  /**
   * Helper function to handle aggregation operations with correct GROUP BY semantics
   * @param selector The selector function
   * @param aggregateType The type of aggregation (SUM, AVG, MIN, MAX, COUNT)
   * @param alias The alias for the result column
   * @param useExplicitColumn For COUNT, whether to use the selected column or COUNT(*)
   */
  private applyAggregation<TResult>(
    selector: AggregateSelector<T> | null,
    aggregateType: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT',
    alias: string,
    useExplicitColumn: boolean = true,
  ): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Extract column information and create the aggregate function
    let aggregateFunc: Expression;

    if (!selector && aggregateType === 'COUNT') {
      // Special case: COUNT(*) with no selector
      aggregateFunc = this.expressionBuilder.createCount(null);
    } else if (selector) {
      // Extract the property name from the selector
      const selectorStr = selector.toString();
      const propMatch = selectorStr.match(/[gs]\.([a-zA-Z0-9_]+)(?:\.|$)/);

      if (propMatch && propMatch[1]) {
        // We extracted the property name, now find which table it belongs to
        const propName = propMatch[1];
        let tableAlias = this.alias; // Default to the main table
        let columnName = propName;

        // Look through the existing projections to find this property
        for (const projection of this.projections) {
          if (projection.getAlias() === propName) {
            // Found in projections - extract the table alias
            const expr = projection.getExpression();
            if (expr instanceof ColumnExpression) {
              tableAlias = expr.getTableAlias();
              columnName = expr.getColumnName();
              break;
            }
          }
        }

        // If not found in projections, check property tracker
        if (tableAlias === this.alias && this.propertyTracker) {
          const propSource = this.propertyTracker.getPropertySource(propName);
          if (propSource) {
            tableAlias = propSource.tableAlias;
            columnName = propSource.columnName !== '*' ? propSource.columnName : propName;
          }
        }

        // Create the column expression with the correct table alias
        const column = this.expressionBuilder.createColumn(columnName, tableAlias);

        // Create the aggregate function
        switch (aggregateType) {
          case 'SUM':
            aggregateFunc = this.expressionBuilder.createSum(column);
            break;
          case 'AVG':
            aggregateFunc = this.expressionBuilder.createAvg(column);
            break;
          case 'MIN':
            aggregateFunc = this.expressionBuilder.createMin(column);
            break;
          case 'MAX':
            aggregateFunc = this.expressionBuilder.createMax(column);
            break;
          case 'COUNT':
            aggregateFunc = this.expressionBuilder.createCount(useExplicitColumn ? column : null);
            break;
        }
      } else {
        // Fall back to the enhanced parser approach if we couldn't extract the property
        const enhancedParser = new LambdaParser(
          this.expressionBuilder,
          this.contextVariables,
          this.propertyTracker,
        );

        const column = enhancedParser.parseAggregationSelector<T>(selector, this.alias);

        // Create the aggregate function
        switch (aggregateType) {
          case 'SUM':
            aggregateFunc = this.expressionBuilder.createSum(column);
            break;
          case 'AVG':
            aggregateFunc = this.expressionBuilder.createAvg(column);
            break;
          case 'MIN':
            aggregateFunc = this.expressionBuilder.createMin(column);
            break;
          case 'MAX':
            aggregateFunc = this.expressionBuilder.createMax(column);
            break;
          case 'COUNT':
            aggregateFunc = this.expressionBuilder.createCount(useExplicitColumn ? column : null);
            break;
        }
      }
    } else {
      // Default fallback for other cases
      const enhancedParser = new LambdaParser(
        this.expressionBuilder,
        this.contextVariables,
        this.propertyTracker,
      );

      // Use a generic expression if no selector is provided (except for COUNT)
      const column = selector
        ? enhancedParser.parseAggregationSelector<T>(selector, this.alias)
        : this.expressionBuilder.createConstant('*');

      // Create the aggregate function
      switch (aggregateType) {
        case 'SUM':
          aggregateFunc = this.expressionBuilder.createSum(column);
          break;
        case 'AVG':
          aggregateFunc = this.expressionBuilder.createAvg(column);
          break;
        case 'MIN':
          aggregateFunc = this.expressionBuilder.createMin(column);
          break;
        case 'MAX':
          aggregateFunc = this.expressionBuilder.createMax(column);
          break;
        case 'COUNT':
          aggregateFunc = this.expressionBuilder.createCount(null);
          break;
      }
    }

    // Filter projections to only include ones that are part of the GROUP BY or aggregates
    if (this.groupByColumns.length > 0) {
      // Map GROUP BY columns to strings for easy comparison
      const groupByColumns = this.groupByColumns
        .map(col => {
          if (col instanceof ColumnExpression) {
            return `${col.getTableAlias()}.${col.getColumnName()}`;
          }
          return null;
        })
        .filter(Boolean) as string[];

      // Filter projections to only include valid columns for GROUP BY
      newQueryable.projections = this.projections.filter(projection => {
        const expr = projection.getExpression();

        // Keep if it's already an aggregate function
        if (
          expr instanceof FunctionExpression &&
          ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'].includes(expr.getFunctionName())
        ) {
          return true;
        }

        // Keep if it's a column that's part of the GROUP BY
        if (expr instanceof ColumnExpression) {
          const columnKey = `${expr.getTableAlias()}.${expr.getColumnName()}`;
          return groupByColumns.includes(columnKey);
        }

        // Conservatively keep expressions we can't analyze
        return false;
      });
    } else {
      // If there's no GROUP BY, we're adding an aggregate to a regular query
      // Keep existing projections
      newQueryable.projections = [...this.projections];
    }

    // Add the aggregate function projection
    newQueryable.projections.push(this.expressionBuilder.createProjection(aggregateFunc, alias));

    return newQueryable;
  }

  // Adicionar à classe Queryable

  /**
   * Adiciona uma condição WHERE EXISTS com subconsulta
   * @param subquery A subconsulta a ser usada na condição
   *
   * @example
   * // Uso correto: sempre fornecer um select explícito
   * users.whereExists(orders.where(o => o.userId === u.id).select(_ => 1))
   */
  whereExists<U>(subquery: Queryable<U>): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Converter o Queryable em uma subconsulta
    const selectExpr = subquery.toMetadata();
    const subqueryExpr = this.expressionBuilder.createSubquery(selectExpr);

    // Criar a expressão EXISTS
    const existsExpr = this.expressionBuilder.createExistsSubquery(subqueryExpr);

    // Se já existe uma cláusula where, fazer um AND com a nova
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.expressionBuilder.createAnd(
        newQueryable.whereClause,
        existsExpr,
      );
    } else {
      newQueryable.whereClause = existsExpr;
    }

    return newQueryable;
  }

  /**
   * Adiciona uma condição WHERE NOT EXISTS com subconsulta
   * @param subquery A subconsulta a ser usada na condição
   *
   * @example
   * // Uso correto: sempre fornecer um select explícito
   * users.whereNotExists(orders.where(o => o.status === 'canceled').select(_ => 1))
   */
  whereNotExists<U>(subquery: Queryable<U>): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Converter o Queryable em uma subconsulta
    const selectExpr = subquery.toMetadata();
    const subqueryExpr = this.expressionBuilder.createSubquery(selectExpr);

    // Criar a expressão NOT EXISTS
    const notExistsExpr = this.expressionBuilder.createNotExistsSubquery(subqueryExpr);

    // Se já existe uma cláusula where, fazer um AND com a nova
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.expressionBuilder.createAnd(
        newQueryable.whereClause,
        notExistsExpr,
      );
    } else {
      newQueryable.whereClause = notExistsExpr;
    }

    return newQueryable;
  }

  /**
   * Adiciona uma condição WHERE IN com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   *
   * @example
   * // Uso correto: a subconsulta deve retornar uma única coluna
   * users.whereIn(u => u.id, orders.select(o => o.userId))
   */
  whereIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Extrair o nome da coluna do selector
    const selectorStr = selector.toString();
    const propertyInfo = this.resolvePropertyPath(selectorStr, this.alias);

    // Criar expressão de coluna
    const column = this.expressionBuilder.createColumn(
      propertyInfo.columnName,
      propertyInfo.tableAlias,
    );

    // Converter o Queryable em uma subconsulta
    const selectExpr = subquery.toMetadata();

    const subqueryExpr = this.expressionBuilder.createSubquery(selectExpr);

    // Criar a expressão IN
    const inExpr = this.expressionBuilder.createInSubquery(column, subqueryExpr);

    // Se já existe uma cláusula where, fazer um AND com a nova
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.expressionBuilder.createAnd(newQueryable.whereClause, inExpr);
    } else {
      newQueryable.whereClause = inExpr;
    }

    return newQueryable;
  }

  /**
   * Adiciona uma condição WHERE NOT IN com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   *
   * @example
   * // Uso correto: a subconsulta deve retornar uma única coluna
   * users.whereNotIn(u => u.id, orders.where(o => o.status === 'canceled').select(o => o.userId))
   */
  whereNotIn<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Extrair o nome da coluna do selector
    const selectorStr = selector.toString();
    const propertyInfo = this.resolvePropertyPath(selectorStr, this.alias);

    // Criar expressão de coluna
    const column = this.expressionBuilder.createColumn(
      propertyInfo.columnName,
      propertyInfo.tableAlias,
    );

    // Converter o Queryable em uma subconsulta
    const selectExpr = subquery.toMetadata();
    const subqueryExpr = this.expressionBuilder.createSubquery(selectExpr);

    // Criar a expressão NOT IN
    const notInExpr = this.expressionBuilder.createNotInSubquery(column, subqueryExpr);

    // Se já existe uma cláusula where, fazer um AND com a nova
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.expressionBuilder.createAnd(
        newQueryable.whereClause,
        notInExpr,
      );
    } else {
      newQueryable.whereClause = notInExpr;
    }

    return newQueryable;
  }

  /**
   * Adiciona uma condição WHERE comparando com resultado de subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param operator Operador de comparação
   * @param subquery A subconsulta a ser usada na condição
   * @example
   * ```
   * // WHERE users.salary > (SELECT AVG(salary) FROM employees)
   * users.whereCompareSubquery(
   *   user => user.salary,
   *   ExpressionType.GreaterThan,
   *   employees.select(e => ({ avg: e.avg(e => e.salary) }))
   * )
   * ```
   */
  whereCompareSubquery<U>(
    selector: (entity: T) => any,
    operator: ExpressionType,
    subquery: Queryable<U>,
  ): Queryable<T> {
    // Criar um novo queryable
    const newQueryable = this.clone();

    // Extrair o nome da coluna do selector
    const selectorStr = selector.toString();
    const propertyInfo = this.resolvePropertyPath(selectorStr, this.alias);

    // Criar expressão de coluna
    const column = this.expressionBuilder.createColumn(
      propertyInfo.columnName,
      propertyInfo.tableAlias,
    );

    // Converter o Queryable em uma subconsulta
    const selectExpr = subquery.toMetadata();
    const subqueryExpr = this.expressionBuilder.createSubquery(selectExpr);

    // Criar a expressão de comparação
    const compareExpr = this.expressionBuilder.createBinary(operator, column, subqueryExpr);

    // Se já existe uma cláusula where, fazer um AND com a nova
    if (newQueryable.whereClause) {
      newQueryable.whereClause = this.expressionBuilder.createAnd(
        newQueryable.whereClause,
        compareExpr,
      );
    } else {
      newQueryable.whereClause = compareExpr;
    }

    return newQueryable;
  }

  /**
   * Adiciona uma condição WHERE = com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   */
  whereEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    return this.whereCompareSubquery(selector, ExpressionType.Equal, subquery);
  }

  /**
   * Adiciona uma condição WHERE != com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   */
  whereNotEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    return this.whereCompareSubquery(selector, ExpressionType.NotEqual, subquery);
  }

  /**
   * Adiciona uma condição WHERE > com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   */
  whereGreaterThan<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    return this.whereCompareSubquery(selector, ExpressionType.GreaterThan, subquery);
  }

  /**
   * Adiciona uma condição WHERE >= com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   */
  whereGreaterThanOrEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    return this.whereCompareSubquery(selector, ExpressionType.GreaterThanOrEqual, subquery);
  }

  /**
   * Adiciona uma condição WHERE < com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   */
  whereLessThan<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    return this.whereCompareSubquery(selector, ExpressionType.LessThan, subquery);
  }

  /**
   * Adiciona uma condição WHERE <= com subconsulta
   * @param selector Função para selecionar o campo a ser comparado
   * @param subquery A subconsulta a ser usada na condição
   */
  whereLessThanOrEqual<U>(selector: (entity: T) => any, subquery: Queryable<U>): Queryable<T> {
    return this.whereCompareSubquery(selector, ExpressionType.LessThanOrEqual, subquery);
  }

  async toListAsync(): Promise<Record<string, any>[]> {
    const metadata = ExpressionSerializer.serialize(this.toMetadata());
    return await this.provider.queryAsync(metadata);
  }

  async firstAsync(): Promise<Record<string, any> | null> {
    const metadata = ExpressionSerializer.serialize(this.toMetadata());
    return await this.provider.firstAsync(metadata);
  }
}
