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
import { OrderByExpression } from '../expressions/SelectExpression';
import { ExpressionBuilder } from './ExpressionBuilder';
import { LambdaParser } from './LambdaParser';
import { SqlGenerationVisitor } from '../visitors/SqlGenerationVisitor';
import { TableExpression } from '../expressions/TableExpression';
import { Expression } from '../expressions/Expression';
import { ProjectionExpression } from '../expressions/ProjectionExpression';
import { ColumnExpression } from '../expressions/ColumnExpression';
import { BinaryExpression } from '../expressions/BinaryExpression';
import { formatSQL, formatSQLClientStyle } from '../../utils/SqlFormatter';
import { PropertyTracker, PropertySource } from './PropertyTracker';

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
    // Create a new queryable
    const newQueryable = this.clone();

    // Parse the predicate into an expression
    const predicateExpr = this.lambdaParser.parsePredicate<T>(predicate, this.alias);

    // If there's already a where clause, AND it with the new one
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
   * Adds a SELECT clause to the query
   * @param selector The selector function
   */
  select<TResult>(selector: SelectorFunction<T, TResult>): Queryable<TResult> {
    // Create a new queryable with the new result type
    const newQueryable = this.cloneWithNewType<TResult>();

    // Parse the selector into a map of property -> expression
    const projections = this.lambdaParser.parseSelector<T, TResult>(selector, this.alias);

    // Registrar propriedades no rastreador
    for (const [propertyName, expression] of projections.entries()) {
      // Determinar a origem da coluna (assumindo que é uma ColumnExpression)
      if (expression instanceof ColumnExpression) {
        newQueryable.propertyTracker.registerProperty(
          propertyName,
          expression.getTableAlias(),
          expression.getColumnName(),
        );
      }
    }

    // Convert the map to projection expressions
    newQueryable.projections = [];
    for (const [propertyName, expression] of projections.entries()) {
      newQueryable.projections.push(
        this.expressionBuilder.createProjection(expression, propertyName),
      );
    }

    return newQueryable;
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

    // Extrair propriedade de origem utilizando regex mais complexo
    const sourceFnStr = sourceKeySelector.toString();
    const sourcePropertyMatch = sourceFnStr.match(/=>\s*\w+(?:\.(\w+))+$/);

    let sourceColumn: Expression;
    let sourcePropertyPath: string[] | undefined;
    let sourcePropertyName: string;

    if (sourcePropertyMatch) {
      // Extrair o caminho completo
      const fullPath = sourceFnStr.match(/=>\s*(\w+(?:\.\w+)+)$/)?.[1];
      if (!fullPath) {
        throw new Error(
          `Não foi possível extrair o caminho da propriedade do seletor de junção de origem: ${sourceFnStr}`,
        );
      }

      // Para casos de junções aninhadas, precisamos rastrear o caminho completo
      const pathParts = fullPath.split('.');

      // O primeiro elemento é geralmente o parâmetro lambda
      if (pathParts.length > 1) {
        sourcePropertyPath = pathParts.slice(1);
        sourcePropertyName = pathParts[pathParts.length - 1];
      } else {
        sourcePropertyName = pathParts[0];
      }

      // Buscar a origem da propriedade para determinar o alias correto
      let tableAlias = this.alias;
      let columnName = sourcePropertyName;

      if (sourcePropertyPath && sourcePropertyPath.length > 0) {
        // Buscar a propriedade no rastreador
        const firstPropName = sourcePropertyPath[0];
        const propSource = this.propertyTracker.getPropertySource(firstPropName);

        if (propSource) {
          tableAlias = propSource.tableAlias;
          columnName = sourcePropertyPath[sourcePropertyPath.length - 1];
        }
      }

      sourceColumn = this.expressionBuilder.createColumn(columnName, tableAlias);
    } else {
      // Caso simples: user => user.id
      const simplePropMatch = sourceFnStr.match(/=>\s*\w+\.(\w+)/);
      if (!simplePropMatch || !simplePropMatch[1]) {
        throw new Error(
          `Não foi possível extrair a propriedade do seletor de junção de origem: ${sourceFnStr}`,
        );
      }
      sourcePropertyName = simplePropMatch[1];
      sourceColumn = this.expressionBuilder.createColumn(sourcePropertyName, this.alias);
    }

    // Extrair nome da propriedade alvo
    const targetFnStr = targetKeySelector.toString();
    const targetPropertyMatch = targetFnStr.match(/=>\s*\w+\.(\w+)/);

    if (!targetPropertyMatch || !targetPropertyMatch[1]) {
      throw new Error(
        `Não foi possível extrair a propriedade do seletor de junção alvo: ${targetFnStr}`,
      );
    }

    const targetPropertyName = targetPropertyMatch[1];

    // Criar expressão de coluna alvo
    const targetColumn = this.expressionBuilder.createColumn(targetPropertyName, targetAlias);

    // Criar a condição de junção
    const joinCondition = this.expressionBuilder.createEqual(sourceColumn, targetColumn);

    // Criar a expressão de junção
    const joinExpr = this.expressionBuilder.createJoin(targetTable, joinCondition, joinType);

    // Adicionar a junção à consulta
    newQueryable.joins.push(joinExpr);

    // Analisar o resultSelector para mapear as propriedades do resultado
    // Este é um lugar onde precisamos implementar análise adicional
    // para entender quais propriedades vêm de qual tabela no resultado combinado
    try {
      // Extrair a estrutura do objeto de resultado da função resultSelector
      const resultFnStr = resultSelector.toString();
      const objectLiteralMatch = resultFnStr.match(/\{([^}]*)\}/);

      if (objectLiteralMatch && objectLiteralMatch[1]) {
        const objectContent = objectLiteralMatch[1];

        // Procurar atribuições de propriedades simples (prop: source.prop ou prop: target.prop)
        const propAssignments = objectContent.split(',').map(s => s.trim());

        for (const assignment of propAssignments) {
          // Exemplo: "userId: user.id" ou "orderId: order.id" ou "user: user" ou "order"
          const parts = assignment.split(':').map(s => s.trim());

          if (parts.length === 2) {
            // Caso com atribuição explícita (prop: value)
            const [propName, propValue] = parts;

            // Verificar se é uma referência direta a source ou target
            if (propValue.match(/^(source|target)$/)) {
              // Caso como "user: user" - referência completa ao objeto
              const isSource = propValue === 'source';
              const refTableAlias = isSource ? this.alias : targetAlias;
              const refTableName = isSource ? this.tableName : targetTableName;

              // Registrar referência ao objeto completo
              // Precisaríamos incluir todas as propriedades deste objeto
              // Para simplificar, registramos apenas a referência ao objeto
              newQueryable.propertyTracker.registerProperty(propName, refTableAlias, '*', [
                propName,
              ]);
            } else if (propValue.match(/^(source|target)\.\w+$/)) {
              // Caso como "userId: source.id"
              const [objRef, propRef] = propValue.split('.');
              const isSource = objRef === 'source';
              const refTableAlias = isSource ? this.alias : targetAlias;

              newQueryable.propertyTracker.registerProperty(propName, refTableAlias, propRef);
            }
          } else if (parts.length === 1 && parts[0].match(/^\w+$/)) {
            // Shorthand property (como "order" significando "order: order")
            const propName = parts[0];

            // Determinar se esse objeto é do primeiro parâmetro (source) ou segundo (target)
            // Essa é uma heurística simples - em uma implementação completa, precisaríamos
            // analisar o escopo da função
            const paramNames = resultFnStr.match(/\(\s*(\w+)\s*,\s*(\w+)\s*\)/);

            if (paramNames && paramNames.length >= 3) {
              const [_, sourceName, targetName] = paramNames;

              if (propName === sourceName) {
                // É uma referência à source
                newQueryable.propertyTracker.registerProperty(propName, this.alias, '*', [
                  propName,
                ]);
              } else if (propName === targetName) {
                // É uma referência ao target
                newQueryable.propertyTracker.registerProperty(propName, targetAlias, '*', [
                  propName,
                ]);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Não foi possível analisar completamente o resultSelector', error);
    }

    return newQueryable;
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

    // Extrair o nome da coluna da função seletora
    const fnStr = selector.toString();

    // Tentar extrair propriedades aninhadas como "joined.user.name"
    const nestedPropMatch = fnStr.match(/=>\s*(\w+)(?:\.(\w+))+/);

    if (nestedPropMatch && nestedPropMatch[0]) {
      const fullPath = fnStr.match(/=>\s*(\w+(?:\.\w+)+)$/)?.[1];
      if (fullPath) {
        const pathParts = fullPath.split('.');
        const firstPart = pathParts[0];
        const lastPart = pathParts[pathParts.length - 1];

        // Verificar se temos uma origem para essa propriedade
        const propSource = this.propertyTracker.getPropertySource(firstPart);

        if (propSource) {
          // Usar o alias da tabela associada à primeira parte do caminho
          const column = this.expressionBuilder.createColumn(lastPart, propSource.tableAlias);
          const orderByExpr = this.expressionBuilder.createOrderBy(
            column,
            direction === OrderDirection.ASC,
          );
          newQueryable.orderByColumns.push(orderByExpr);
          return newQueryable;
        }
      }
    }

    // Caso padrão para propriedade simples
    const propertyMatch = fnStr.match(/=>\s*\w+\.(\w+)/);

    if (!propertyMatch || !propertyMatch[1]) {
      throw new Error(`Não foi possível extrair o nome da propriedade do seletor: ${fnStr}`);
    }

    const propertyName = propertyMatch[1];

    // Verificar se temos uma origem para essa propriedade
    const propSource = this.propertyTracker.getPropertySource(propertyName);
    const tableAlias = propSource ? propSource.tableAlias : this.alias;

    // Criar uma expressão de coluna para a propriedade extraída
    const column = this.expressionBuilder.createColumn(propertyName, tableAlias);

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
}
