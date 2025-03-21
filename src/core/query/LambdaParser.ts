// src/core/query/LambdaParser.ts (aprimorado)
import * as ts from 'typescript';
import { Expression, ExpressionType } from '../expressions/Expression';
import { ExpressionBuilder } from './ExpressionBuilder';
import { PropertyTracker } from './PropertyTracker';
import { AggregateSelector } from './Types';

/**
 * Interface que representa um resultado de mapeamento de propriedade
 */
export interface PropertyMapping {
  /** Nome da propriedade no resultado */
  propertyName: string;
  /** Expressão associada à propriedade */
  expression: Expression;
  /** Alias da tabela de origem (se conhecido) */
  tableAlias?: string;
  /** Nome da coluna na tabela (se conhecido) */
  columnName?: string;
  /** Caminho de propriedade para objetos aninhados */
  propertyPath?: string[];
  /** Se é uma expressão complexa (não um simples acesso a coluna) */
  isComplex: boolean;
}

/**
 * Analisa expressões lambda TypeScript em árvores de expressões
 */
export class LambdaParser {
  private readonly builder: ExpressionBuilder;
  private readonly variables: Record<string, any>;
  private parameterName: string = '';
  private secondParameterName: string | null = null;
  private readonly propertyTracker?: PropertyTracker;

  /**
   * Cria um novo analisador lambda
   * @param builder O construtor de expressões a ser usado
   * @param variables Variáveis que podem ser usadas no lambda
   * @param propertyTracker Opcional - rastreador de propriedades para referência
   */
  constructor(
    builder: ExpressionBuilder,
    variables: Record<string, any> = {},
    propertyTracker?: PropertyTracker,
  ) {
    this.builder = builder;
    this.variables = variables;
    this.propertyTracker = propertyTracker;
  }

  parseAggregationSelector<T>(selector: (entity: T) => any, defaultTableAlias: string): Expression {
    // Extract the function string
    const selectorStr = selector.toString();
    this.extractParameterName(selectorStr);

    // Check if we have a nested property (like joined.order.amount)
    const nestedPropertyMatch = selectorStr.match(/=>\s*\w+\.(\w+)\.(\w+)/);

    if (nestedPropertyMatch && nestedPropertyMatch[1] && nestedPropertyMatch[2]) {
      const objectName = nestedPropertyMatch[1]; // e.g., "order"
      const propertyName = nestedPropertyMatch[2]; // e.g., "amount"

      // Try to resolve the correct table alias for this nested property
      if (this.propertyTracker) {
        // Strategy 1: Direct object registration
        const objectSource = this.propertyTracker.getPropertySource(objectName);
        if (objectSource) {
          return this.builder.createColumn(propertyName, objectSource.tableAlias);
        }

        // Strategy 2: Wildcard registration
        const wildcardKey = `${objectName}.*`;
        const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
        if (wildcardSource) {
          return this.builder.createColumn(propertyName, wildcardSource.tableAlias);
        }

        // Strategy 3: Search all property sources
        for (const [propName, source] of this.propertyTracker.getAllPropertySources().entries()) {
          if (
            propName === objectName ||
            (source.propertyPath && source.propertyPath.includes(objectName))
          ) {
            return this.builder.createColumn(propertyName, source.tableAlias);
          }
        }

        // Strategy 4: Table alias matching
        for (const alias of this.propertyTracker.getTableAliases()) {
          // Exact match or first letter match
          if (
            alias === objectName ||
            alias.toLowerCase() === objectName.toLowerCase() ||
            alias.charAt(0).toLowerCase() === objectName.charAt(0).toLowerCase()
          ) {
            return this.builder.createColumn(propertyName, alias);
          }
        }
      }
    }

    // For simple property access (entity.property)
    const simplePropertyMatch = selectorStr.match(/=>\s*\w+\.(\w+)/);
    if (simplePropertyMatch && simplePropertyMatch[1]) {
      const propertyName = simplePropertyMatch[1];
      return this.builder.createColumn(propertyName, defaultTableAlias);
    }

    // Fallback: couldn't determine the property
    throw new Error(`Could not extract property from aggregation selector: ${selectorStr}`);
  }

  /**
   * Analisa uma função de predicado em uma árvore de expressões
   * @param predicate A função de predicado (por exemplo, x => x.id === 1)
   * @param tableAlias O alias para a tabela
   */
  parsePredicate<T, P = Record<string, any>>(
    predicate: (entity: T, params?: P) => boolean,
    tableAlias: string,
  ): Expression {
    const fnString = predicate.toString();
    this.extractParameterNames(fnString);

    // Analisar o corpo da função em uma AST
    const node = this.parseLambda(fnString);

    // Converter a AST em uma árvore de expressões
    return this.processNode(node, tableAlias);
  }

  /**
   * Analisa uma função seletora em um objeto com mapeamentos de colunas
   * @param selector A função seletora (por exemplo, x => ({ id: x.id, name: x.name }))
   * @param tableAlias O alias para a tabela
   */
  parseSelector<T, TResult>(
    selector: (entity: T) => TResult,
    tableAlias: string,
  ): Map<string, Expression> {
    const fnString = selector.toString();
    this.extractParameterName(fnString);

    // Analisar o corpo da função em uma AST
    const node = this.parseLambda(fnString);

    // Converter a AST em um mapa de nome da propriedade -> expressão
    return this.processProjection(node, tableAlias);
  }

  /**
   * Analisa uma função seletora com suporte melhorado a propriedades aninhadas
   * @param selector A função seletora
   * @param tableAlias O alias da tabela principal
   * @returns Um mapa de PropertyMapping para cada propriedade
   */
  parseSelectorEnhanced<T, TResult>(
    selector: (entity: T) => TResult,
    tableAlias: string,
  ): Map<string, PropertyMapping> {
    const fnString = selector.toString();
    this.extractParameterName(fnString);

    const result = new Map<string, PropertyMapping>();

    // Analisar o corpo da função em uma AST
    const node = this.parseLambda(fnString);

    if (ts.isReturnStatement(node) && node.expression && ts.isLiteralExpression(node.expression)) {
      const expression = this.processNode(node.expression, '');
      result.set('', {
        propertyName: '',
        expression,
        tableAlias: '',
        columnName: '',
        propertyPath: [], // Remover o parâmetro inicial
        isComplex: false,
      });
      return result;
    }

    // Encontrar o literal de objeto no corpo da função
    let objectLiteral = this.findObjectLiteral(node);

    if (!objectLiteral) {
      throw new Error('Esperava-se uma expressão literal de objeto na função select');
    }

    // Processar cada propriedade no literal de objeto
    for (const property of objectLiteral.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
        const propertyName = property.name.text;

        // Verificar se o inicializador é uma propriedade aninhada
        if (ts.isPropertyAccessExpression(property.initializer)) {
          const propPath = this.extractPropertyPath(property.initializer);

          if (propPath.length >= 3 && propPath[0] === this.parameterName) {
            // Temos uma propriedade aninhada como joined.order.amount
            const objectName = propPath[1]; // ex: "order"
            const columnName = propPath[propPath.length - 1]; // ex: "amount"

            // Tentar resolver a tabela correta usando o PropertyTracker
            let resolvedTableAlias = tableAlias;
            let isComplex = false;

            if (this.propertyTracker) {
              // Verificar se o objeto intermediário está registrado
              const objectSource = this.propertyTracker.getPropertySource(objectName);

              if (objectSource) {
                // Usar o alias da tabela do objeto intermediário
                resolvedTableAlias = objectSource.tableAlias;
              } else {
                // Verificar wildcard
                const wildcardKey = `${objectName}.*`;
                const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);

                if (wildcardSource) {
                  resolvedTableAlias = wildcardSource.tableAlias;
                } else {
                  // Tentar inferir pelo padrão de nomeação
                  for (const [alias, _] of this.propertyTracker.getTableAliasMap().entries()) {
                    if (
                      alias === objectName ||
                      (objectName.length > 0 && alias === objectName[0])
                    ) {
                      resolvedTableAlias = alias;
                      break;
                    }
                  }
                }
              }
            }

            // Criar a expressão de coluna com o alias correto
            const expression = this.builder.createColumn(columnName, resolvedTableAlias);

            // Registrar no mapa de resultados
            result.set(propertyName, {
              propertyName,
              expression,
              tableAlias: resolvedTableAlias,
              columnName,
              propertyPath: propPath.slice(1), // Remover o parâmetro inicial
              isComplex,
            });
          } else {
            // Caso padrão: processamento normal
            const expressionResult = this.processPropertyInitializer(
              property.initializer,
              tableAlias,
            );

            result.set(propertyName, {
              propertyName,
              expression: expressionResult.expression,
              tableAlias: expressionResult.tableAlias,
              columnName: expressionResult.columnName,
              propertyPath: expressionResult.propertyPath,
              isComplex: expressionResult.isComplex,
            });
          }
        } else {
          // Não é um acesso de propriedade aninhado
          const expressionResult = this.processPropertyInitializer(
            property.initializer,
            tableAlias,
          );

          result.set(propertyName, {
            propertyName,
            expression: expressionResult.expression,
            tableAlias: expressionResult.tableAlias,
            columnName: expressionResult.columnName,
            propertyPath: expressionResult.propertyPath,
            isComplex: expressionResult.isComplex,
          });
        }
      }
    }

    return result;
  }

  /**
   * Encontra um literal de objeto em um nó AST
   */
  private findObjectLiteral(node: ts.Node): ts.ObjectLiteralExpression | null {
    if (ts.isObjectLiteralExpression(node)) {
      return node;
    }

    if (ts.isExpressionStatement(node) && ts.isObjectLiteralExpression(node.expression)) {
      return node.expression;
    }

    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      return node.expression;
    }

    if (ts.isParenthesizedExpression(node) && ts.isObjectLiteralExpression(node.expression)) {
      return node.expression;
    }

    // Para funções de seta com retorno implícito de literais de objeto
    if (ts.isArrowFunction(node) && node.body && ts.isObjectLiteralExpression(node.body)) {
      return node.body;
    }

    // Busca recursiva em filhos
    let found: ts.ObjectLiteralExpression | null = null;
    node.forEachChild(child => {
      if (!found) {
        found = this.findObjectLiteral(child);
      }
    });

    return found;
  }

  /**
   * Extrai o nome do parâmetro de uma string de função lambda
   * @param fnString A string da função
   */
  private extractParameterName(fnString: string): void {
    // Corresponder padrões de parâmetros:
    // 1. Função de seta: (x) => ... ou x => ...
    // 2. Expressão de função: function(x) { ... }
    const paramMatch = fnString.match(/\(\s*([^)]*)\s*\)\s*=>|\s*(\w+)\s*=>/);

    if (paramMatch) {
      // Usar o nome do parâmetro capturado
      this.parameterName = (paramMatch[1] || paramMatch[2]).trim();
    } else {
      // Nome de parâmetro padrão se não pudermos extraí-lo
      this.parameterName = 'entity';
    }
  }

  /**
   * Analisa uma string de função lambda em uma AST
   * @param fnString A string da função
   * @returns O nó AST resultante
   */
  parseLambda(fnString: string): ts.Node {
    // Esta função já existe no código original, mas a tornei pública
    // para que possa ser chamada pelo método select

    // Determinar se esta é uma função de seta ou expressão de função
    const isArrow = fnString.includes('=>');

    // Extrair o corpo da função
    let functionBody = '';

    if (isArrow) {
      // Função de seta: extrair tudo após =>
      const bodyStart = fnString.indexOf('=>') + 2;
      functionBody = fnString.substring(bodyStart).trim();

      // Se o corpo não começa com {, envolvê-lo com return
      if (!functionBody.startsWith('{')) {
        functionBody = `return ${functionBody}`;
      } else {
        // Remover as {} externas
        functionBody = functionBody.substring(1, functionBody.length - 1).trim();
      }
    } else {
      // Expressão de função: extrair tudo entre { e }
      const bodyStart = fnString.indexOf('{') + 1;
      const bodyEnd = fnString.lastIndexOf('}');
      functionBody = fnString.substring(bodyStart, bodyEnd).trim();
    }

    // Extrair o nome do parâmetro
    this.extractParameterName(fnString);

    // Criar um arquivo fonte para análise
    const sourceFile = ts.createSourceFile(
      'expression.ts',
      functionBody,
      ts.ScriptTarget.Latest,
      true,
    );

    // Retornar a primeira declaração do corpo da função
    return sourceFile.statements[0];
  }

  /**
   * Processa um nó de AST e o converte em uma árvore de expressões
   * @param node O nó de AST
   * @param tableAlias O alias para a tabela
   */
  private processNode(node: ts.Node, tableAlias: string): Expression {
    // Processar diferentes tipos de nós
    if (ts.isExpressionStatement(node)) {
      return this.processNode(node.expression, tableAlias);
    }

    if (ts.isReturnStatement(node)) {
      return this.processNode(node.expression!, tableAlias);
    }

    if (ts.isBinaryExpression(node)) {
      return this.processBinaryExpression(node, tableAlias);
    }

    if (ts.isPrefixUnaryExpression(node)) {
      return this.processPrefixUnaryExpression(node, tableAlias);
    }

    if (ts.isPropertyAccessExpression(node)) {
      return this.processPropertyAccess(node, tableAlias);
    }

    if (ts.isIdentifier(node)) {
      return this.processIdentifier(node, tableAlias);
    }

    if (ts.isLiteralExpression(node)) {
      return this.processLiteral(node);
    }

    if (ts.isCallExpression(node)) {
      return this.processCallExpression(node, tableAlias);
    }

    if (ts.isParenthesizedExpression(node)) {
      return this.processNode(node.expression, tableAlias);
    }

    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
        return this.builder.createConstant((node as ts.StringLiteral).text);

      case ts.SyntaxKind.NumericLiteral:
        return this.builder.createConstant((node as ts.NumericLiteral).text);

      case ts.SyntaxKind.TrueKeyword:
        return this.builder.createConstant(true);

      case ts.SyntaxKind.FalseKeyword:
        return this.builder.createConstant(false);

      case ts.SyntaxKind.NullKeyword:
        return this.builder.createConstant(null);

      default:
        // Padrão: converter para uma constante (usando o texto original do nó)
        return this.builder.createConstant(node.getText());
    }
  }

  /**
   * Processa uma projeção aprimorada com suporte a propriedades aninhadas
   * @param node O nó AST
   * @param tableAlias O alias da tabela
   */
  private processProjectionEnhanced(
    node: ts.Node,
    tableAlias: string,
  ): Map<string, PropertyMapping> {
    const result = new Map<string, PropertyMapping>();

    // Encontrar a expressão literal de objeto no corpo da função
    let objectLiteral: ts.ObjectLiteralExpression | null = null;

    // Função para procurar recursivamente um literal de objeto
    const findObjectLiteral = (node: ts.Node): ts.ObjectLiteralExpression | null => {
      if (ts.isObjectLiteralExpression(node)) {
        return node;
      }

      if (ts.isExpressionStatement(node) && ts.isObjectLiteralExpression(node.expression)) {
        return node.expression;
      }

      if (
        ts.isReturnStatement(node) &&
        node.expression &&
        ts.isObjectLiteralExpression(node.expression)
      ) {
        return node.expression;
      }

      if (ts.isParenthesizedExpression(node) && ts.isObjectLiteralExpression(node.expression)) {
        return node.expression;
      }

      // Para funções de seta com retorno implícito de literais de objeto
      if (ts.isArrowFunction(node) && node.body && ts.isObjectLiteralExpression(node.body)) {
        return node.body;
      }

      // Busca recursiva em filhos
      let found: ts.ObjectLiteralExpression | null = null;
      node.forEachChild(child => {
        if (!found) {
          found = findObjectLiteral(child);
        }
      });

      return found;
    };

    objectLiteral = findObjectLiteral(node);

    if (!objectLiteral) {
      throw new Error('Esperava-se uma expressão literal de objeto na função select');
    }

    // Processar cada propriedade no literal de objeto
    for (const property of objectLiteral.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
        const propertyName = property.name.text;

        // Processar a inicialização da propriedade
        const expressionResult = this.processPropertyInitializer(property.initializer, tableAlias);

        result.set(propertyName, {
          propertyName,
          expression: expressionResult.expression,
          tableAlias: expressionResult.tableAlias,
          columnName: expressionResult.columnName,
          propertyPath: expressionResult.propertyPath,
          isComplex: expressionResult.isComplex,
        });
      }
    }

    return result;
  }

  /**
   * Processa um inicializador de propriedade, extraindo informações sobre a origem
   * @param node O nó do inicializador
   * @param defaultTableAlias O alias padrão da tabela
   */
  private processPropertyInitializer(
    node: ts.Expression,
    defaultTableAlias: string,
  ): PropertyMapping {
    let expression: Expression;
    let tableAlias = defaultTableAlias;
    let columnName: string | undefined;
    let propertyPath: string[] | undefined;
    let isComplex = false;

    if (ts.isPropertyAccessExpression(node)) {
      // Caso como: entity.propertyName ou obj.nested.prop

      // Extrair o caminho completo da propriedade
      const propPath = this.extractPropertyPath(node);

      if (propPath.length > 0) {
        // O primeiro elemento pode ser o parâmetro ou uma variável
        const firstElement = propPath[0];

        if (firstElement === this.parameterName) {
          // É um acesso direto à propriedade do parâmetro lambda
          // Por exemplo: user.name
          columnName = propPath[propPath.length - 1];

          if (propPath.length > 2) {
            // Há propriedades aninhadas, como user.address.city
            propertyPath = propPath.slice(1);

            // Verificar se temos informações sobre a tabela para propriedades aninhadas
            if (this.propertyTracker && propPath.length > 2) {
              const nestedProp = propPath[1];
              const source = this.propertyTracker.getPropertySource(nestedProp);

              if (source) {
                tableAlias = source.tableAlias;
              }
            }
          }

          expression = this.builder.createColumn(columnName, tableAlias);
        } else if (firstElement in this.variables) {
          // É uma variável de contexto
          isComplex = true;
          expression = this.builder.createConstant(this.variables[firstElement]);
        } else if (this.propertyTracker && this.propertyTracker.hasProperty(firstElement)) {
          // É uma propriedade registrada (possivelmente de um join)
          const source = this.propertyTracker.getPropertySource(firstElement);

          if (source) {
            tableAlias = source.tableAlias;

            if (propPath.length > 1) {
              // É um acesso a uma subpropriedade, como order.detail
              columnName = propPath[propPath.length - 1];
              propertyPath = propPath;
            } else {
              // É apenas a propriedade direta
              columnName = source.columnName;
            }

            expression = this.builder.createColumn(columnName!, tableAlias);
          } else {
            // Fallback para coluna simples
            columnName = propPath[propPath.length - 1];
            expression = this.builder.createColumn(columnName, tableAlias);
          }
        } else {
          // Fallback para coluna simples
          columnName = propPath[propPath.length - 1];
          expression = this.builder.createColumn(columnName, tableAlias);
        }
      } else {
        // Não foi possível extrair o caminho da propriedade, usar o nó como está
        columnName = node.getText();
        expression = this.builder.createColumn(columnName, tableAlias);
      }
    } else if (ts.isIdentifier(node)) {
      // Caso como: propertyName (sem qualificador)
      const name = node.text;

      if (name === this.parameterName) {
        // Referência ao parâmetro inteiro (raro)
        isComplex = true;
        expression = this.builder.createConstant(tableAlias);
      } else if (name in this.variables) {
        // É uma variável de contexto
        isComplex = true;
        expression = this.builder.createConstant(this.variables[name]);
      } else if (this.propertyTracker && this.propertyTracker.hasProperty(name)) {
        // É uma propriedade registrada
        const source = this.propertyTracker.getPropertySource(name);

        if (source) {
          tableAlias = source.tableAlias;
          columnName = source.columnName;
          expression = this.builder.createColumn(columnName, tableAlias);
        } else {
          // Fallback para coluna simples
          columnName = name;
          expression = this.builder.createColumn(columnName, tableAlias);
        }
      } else {
        // Assumir que é uma coluna
        columnName = name;
        expression = this.builder.createColumn(columnName, tableAlias);
      }
    } else if (
      ts.isBinaryExpression(node) ||
      ts.isCallExpression(node) ||
      ts.isConditionalExpression(node)
    ) {
      // É uma expressão complexa
      isComplex = true;
      expression = this.processNode(node, tableAlias);
    } else if (ts.isLiteralExpression(node)) {
      // É um literal (string, número, etc.)
      isComplex = true;
      expression = this.processLiteral(node);
    } else {
      // Para outros tipos de expressões
      isComplex = true;
      expression = this.processNode(node, tableAlias);
    }

    return {
      propertyName: '', // Será preenchido pelo chamador
      expression,
      tableAlias,
      columnName,
      propertyPath,
      isComplex,
    };
  }

  /**
   * Extrai o caminho completo da propriedade de uma expressão de acesso a propriedade
   * @param node Nó de expressão de acesso a propriedade
   * @returns Array com cada parte do caminho (ex: ['user', 'address', 'city'])
   */
  private extractPropertyPath(node: ts.PropertyAccessExpression): string[] {
    const path: string[] = [];

    // Adicionar a propriedade atual
    path.unshift(node.name.text);

    // Processar recursivamente a expressão à esquerda
    let current: ts.Expression = node.expression;

    while (current) {
      if (ts.isPropertyAccessExpression(current)) {
        path.unshift(current.name.text);
        current = current.expression;
      } else if (ts.isIdentifier(current)) {
        path.unshift(current.text);
        break;
      } else {
        // Não é um caminho de propriedade simples
        break;
      }
    }

    return path;
  }

  /**
   * Processa uma expressão de acesso a propriedade
   * @param node O nó de expressão de acesso a propriedade
   * @param tableAlias O alias para a tabela
   */
  private processPropertyAccess(node: ts.PropertyAccessExpression, tableAlias: string): Expression {
    // Extract the full property path (e.g., ['entity', 'order', 'amount'])
    const propPath = this.extractPropertyPath(node);

    // If somehow we don't have a path (shouldn't happen), default to simple column
    if (propPath.length === 0) {
      return this.builder.createColumn(node.name.text, tableAlias);
    }

    if (this.secondParameterName && propPath[0] === this.secondParameterName) {
      // It's a reference to the second parameter (e.g., params.age)
      const propertyName = propPath[1];

      if (propertyName in this.variables) {
        // Convert to a constant expression with the value from variables
        return this.builder.createConstant(this.variables[propertyName]);
      }

      // If property not found in variables, warn and return null
      console.warn(`Reference to parameter '${propertyName}' not found in variables`);
      return this.builder.createConstant(null);
    }

    // Get the full path as a string for property tracker lookups
    const fullPropertyPath = propPath.join('.');

    // Check if we're dealing with a nested property (at least 3-part path: entity.object.property)
    if (propPath.length >= 3 && propPath[0] === this.parameterName) {
      // We have a nested property like "joined.traducao.arLanguage"
      const objectName = propPath[1]; // e.g., "traducao"
      const propertyName = propPath[propPath.length - 1]; // e.g., "arLanguage"

      // Try to resolve the correct table alias using property tracker
      if (this.propertyTracker) {
        // Strategy 1: Check if the object is registered directly
        const objectSource = this.propertyTracker.getPropertySource(objectName);
        if (objectSource) {
          return this.builder.createColumn(propertyName, objectSource.tableAlias);
        }

        // Strategy 2: Check for wildcard registration
        const wildcardKey = `${objectName}.*`;
        const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
        if (wildcardSource) {
          return this.builder.createColumn(propertyName, wildcardSource.tableAlias);
        }

        // Strategy 3: Check all registered properties for matches
        for (const [propName, source] of this.propertyTracker.getAllPropertySources().entries()) {
          if (
            propName === objectName ||
            (source.propertyPath && source.propertyPath.includes(objectName))
          ) {
            return this.builder.createColumn(propertyName, source.tableAlias);
          }
        }

        // Strategy 4: Check all table aliases
        for (const alias of this.propertyTracker.getTableAliases()) {
          // Check for exact match or first letter match (common convention)
          if (
            alias === objectName ||
            alias.toLowerCase() === objectName.toLowerCase() ||
            alias.charAt(0).toLowerCase() === objectName.charAt(0).toLowerCase()
          ) {
            return this.builder.createColumn(propertyName, alias);
          }
        }
      }
    }

    // Standard case 1: Check if the property tracker has info about this property path
    if (this.propertyTracker) {
      const source = this.propertyTracker.getPropertySource(fullPropertyPath);
      if (source) {
        return this.builder.createColumn(source.columnName, source.tableAlias);
      }
    }

    // Standard case 2: Simple property access from the parameter (e.g., entity.id)
    if (propPath[0] === this.parameterName && propPath.length === 2) {
      return this.builder.createColumn(propPath[1], tableAlias);
    }

    // Fallback for other property access patterns
    const propertyName = node.name.text;
    return this.builder.createColumn(propertyName, tableAlias);
  }

  /**
   * Processa uma expressão binária
   * @param node O nó de expressão binária
   * @param tableAlias O alias para a tabela
   */
  private processBinaryExpression(node: ts.BinaryExpression, tableAlias: string): Expression {
    // Obter o operador
    const operator = this.mapBinaryOperator(node.operatorToken.kind);

    // Processar operandos à esquerda e à direita
    const left = this.processNode(node.left, tableAlias);
    const right = this.processNode(node.right, tableAlias);

    // Criar uma expressão binária
    return this.builder.createBinary(operator, left, right);
  }

  /**
   * Processa uma expressão unária de prefixo
   * @param node O nó de expressão unária de prefixo
   * @param tableAlias O alias para a tabela
   */
  private processPrefixUnaryExpression(
    node: ts.PrefixUnaryExpression,
    tableAlias: string,
  ): Expression {
    // Obter o operador
    const operator = this.mapUnaryOperator(node.operator);

    // Processar o operando
    const operand = this.processNode(node.operand, tableAlias);

    // Criar uma expressão unária
    return this.builder.createUnary(operator, operand);
  }

  /**
   * Processa um identificador
   * @param node O nó identificador
   * @param tableAlias O alias para a tabela
   */
  private processIdentifier(node: ts.Identifier, tableAlias: string): Expression {
    const name = node.text;

    // Verificar se este é nosso parâmetro
    if (name === this.parameterName) {
      // Esta é uma referência à entidade inteira - não comum em SQL
      // Por enquanto, apenas retornar uma referência à tabela
      return this.builder.createConstant(`${tableAlias}`);
    }

    // Verificar se é o segundo parâmetro (embora isso seja raro sem acesso a propriedade)
    if (this.secondParameterName && name === this.secondParameterName) {
      // Isso seria uma referência ao objeto params inteiro
      // Não é comum, mas retornamos uma constante representando o objeto
      return this.builder.createConstant(this.variables);
    }

    // Verificar se é uma variável de contexto
    if (name in this.variables) {
      // É uma variável, retornar seu valor
      return this.builder.createConstant(this.variables[name]);
    }

    // Verificar se temos informações no rastreador de propriedades
    if (this.propertyTracker) {
      const source = this.propertyTracker.getPropertySource(name);

      if (source) {
        // Temos uma fonte para esta propriedade
        return this.builder.createColumn(source.columnName, source.tableAlias);
      }
    }

    // Caso contrário, assumir que é uma coluna (embora isso provavelmente seja um erro)
    return this.builder.createColumn(name, tableAlias);
  }

  /**
   * Processa uma expressão literal
   * @param node O nó de expressão literal
   */
  private processLiteral(node: ts.LiteralExpression): Expression {
    // Lidar com diferentes tipos de literais
    if (ts.isStringLiteral(node)) {
      return this.builder.createConstant(node.text);
    }

    if (ts.isNumericLiteral(node)) {
      return this.builder.createConstant(Number(node.text));
    }

    // Lidar com palavras-chave true/false
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return this.builder.createConstant(true);
    }

    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return this.builder.createConstant(false);
    }

    // Lidar com palavra-chave null
    if (node.kind === ts.SyntaxKind.NullKeyword) {
      return this.builder.createConstant(null);
    }

    // Padrão: converter para string
    return this.builder.createConstant(node.getText());
  }

  /**
   * Verifica se uma expressão é uma referência a uma propriedade do objeto de parâmetros
   * Exemplo: params.allowedStatuses
   */
  private isParameterArrayReference(expr: ts.Expression): boolean {
    if (ts.isPropertyAccessExpression(expr)) {
      // Verificar se o objeto base é o parâmetro
      if (
        ts.isIdentifier(expr.expression) &&
        this.secondParameterName &&
        expr.expression.text === this.secondParameterName
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extrai o nome da propriedade de uma expressão de acesso a propriedade de parâmetro
   * Exemplo: params.allowedStatuses => 'allowedStatuses'
   */
  private extractParamPropertyName(expr: ts.Expression): string | null {
    if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      this.secondParameterName &&
      expr.expression.text === this.secondParameterName
    ) {
      return expr.name.text;
    }
    return null;
  }

  /**
   * Processa uma expressão de chamada
   * @param node O nó de expressão de chamada
   * @param tableAlias O alias para a tabela
   */
  private processCallExpression(node: ts.CallExpression, tableAlias: string): Expression {
    // Lidar com chamadas de método como string.includes(), array.some(), etc.
    if (ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const object = this.processNode(node.expression.expression, tableAlias);
      const args = node.arguments.map(arg => this.processNode(arg, tableAlias));

      if (args.length === 0) {
        switch (method) {
          case 'trim':
            // Converter para função SQL TRIM
            return this.builder.createFunction('TRIM', [object]);

          case 'trimStart':
          case 'trimLeft':
            // Converter para função SQL LTRIM
            return this.builder.createFunction('LTRIM', [object]);

          case 'trimEnd':
          case 'trimRight':
            // Converter para função SQL RTRIM
            return this.builder.createFunction('RTRIM', [object]);
        }
      }

      // Lidar com string.includes() -> LIKE
      if (method === 'includes' && args.length === 1) {
        // Verificar se estamos lidando com uma expressão de parâmetro
        // Exemplo: params.allowedStatuses.includes(user.status)
        if (this.isParameterArrayReference(node.expression.expression)) {
          // Obter o nome da propriedade do parâmetro (ex: 'allowedStatuses')
          const paramPropName = this.extractParamPropertyName(node.expression.expression);

          if (
            paramPropName &&
            paramPropName in this.variables &&
            Array.isArray(this.variables[paramPropName])
          ) {
            // Estamos lidando com um array nos parâmetros
            // Inverter a ordem: args[0] IN (array values)
            return this.builder.createBinary(
              ExpressionType.In,
              args[0], // O valor a verificar (ex: user.status)
              this.builder.createConstant(this.variables[paramPropName]), // O array de valores
            );
          }
        }

        // Lidar com string.includes() -> LIKE

        // Converter para SQL LIKE
        const pattern = this.builder.createFunction('CONCAT', [
          this.builder.createConstant('%'),
          args[0],
          this.builder.createConstant('%'),
        ]);

        return this.builder.createFunction('LIKE', [object, pattern]);
      }

      // Lidar com outros métodos - poderia adicionar mais aqui
      // ...

      // Padrão: converter para uma chamada de função
      return this.builder.createFunction(method, [object, ...args]);
    }

    // Lidar com chamadas de função diretas
    if (ts.isIdentifier(node.expression)) {
      const functionName = node.expression.text;
      const args = node.arguments.map(arg => this.processNode(arg, tableAlias));

      // Lidar com funções SQL
      if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(functionName.toUpperCase())) {
        return this.builder.createFunction(functionName.toUpperCase(), args);
      }

      // Padrão: converter para uma chamada de função
      return this.builder.createFunction(functionName, args);
    }

    // Lidar com outros casos - pode ser uma expressão complexa
    return this.builder.createConstant(node.getText());
  }

  /**
   * Processa uma expressão de projeção (literal de objeto na função select)
   * @param node O nó AST
   * @param tableAlias O alias para a tabela
   */
  private processProjection(node: ts.Node, tableAlias: string): Map<string, Expression> {
    const result = new Map<string, Expression>();

    // Encontrar a expressão literal de objeto no corpo da função
    let objectLiteral: ts.ObjectLiteralExpression | null = null;

    // Função para procurar recursivamente um literal de objeto
    const findObjectLiteral = (node: ts.Node): ts.ObjectLiteralExpression | null => {
      if (ts.isObjectLiteralExpression(node)) {
        return node;
      }

      if (ts.isExpressionStatement(node) && ts.isObjectLiteralExpression(node.expression)) {
        return node.expression;
      }

      if (
        ts.isReturnStatement(node) &&
        node.expression &&
        ts.isObjectLiteralExpression(node.expression)
      ) {
        return node.expression;
      }

      if (ts.isParenthesizedExpression(node) && ts.isObjectLiteralExpression(node.expression)) {
        return node.expression;
      }

      // Para funções de seta com retorno implícito de literais de objeto
      if (ts.isArrowFunction(node) && node.body && ts.isObjectLiteralExpression(node.body)) {
        return node.body;
      }

      // Busca recursiva em filhos
      let found: ts.ObjectLiteralExpression | null = null;
      node.forEachChild(child => {
        if (!found) {
          found = findObjectLiteral(child);
        }
      });

      return found;
    };

    objectLiteral = findObjectLiteral(node);

    if (!objectLiteral) {
      throw new Error('Esperava-se uma expressão literal de objeto na função select');
    }

    // Processar cada propriedade no literal de objeto
    for (const property of objectLiteral.properties) {
      if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
        const propertyName = property.name.text;
        const expression = this.processNode(property.initializer, tableAlias);

        result.set(propertyName, expression);
      }
    }

    return result;
  }

  /**
   * Tenta avaliar uma expressão TypeScript para obter seu valor em tempo de execução
   * @param node O nó AST a ser avaliado
   */
  private evaluateExpression(node: ts.Node): any {
    // Este é um avaliador simplificado - um real seria mais complexo

    // Lidar com identificadores (variáveis)
    if (ts.isIdentifier(node)) {
      const name = node.text;

      // Verificar se está em nossas variáveis
      if (name in this.variables) {
        return this.variables[name];
      }

      // Verificar se temos informações no rastreador de propriedades
      if (this.propertyTracker && this.propertyTracker.hasProperty(name)) {
        // Aqui poderíamos retornar informações adicionais, mas
        // como estamos avaliando um valor, não uma expressão SQL,
        // retornamos indefinido
        return undefined;
      }

      return undefined;
    }

    // Lidar com literais
    if (ts.isStringLiteral(node)) {
      return node.text;
    }

    if (ts.isNumericLiteral(node)) {
      return Number(node.text);
    }

    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return true;
    }

    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }

    if (node.kind === ts.SyntaxKind.NullKeyword) {
      return null;
    }

    // Lidar com acesso a propriedade
    if (ts.isPropertyAccessExpression(node)) {
      const object = this.evaluateExpression(node.expression);

      if (object !== undefined && object !== null) {
        return object[node.name.text];
      }

      return undefined;
    }

    // Para outras expressões, precisaríamos de um avaliador JavaScript completo
    // Este é um tópico complexo - por enquanto, retornaremos undefined
    return undefined;
  }

  /**
   * Mapeia um operador binário TypeScript para um tipo de expressão
   * @param kind O tipo de sintaxe TypeScript
   */
  private mapBinaryOperator(kind: ts.SyntaxKind): ExpressionType {
    switch (kind) {
      case ts.SyntaxKind.PlusToken:
        return ExpressionType.Add;
      case ts.SyntaxKind.MinusToken:
        return ExpressionType.Subtract;
      case ts.SyntaxKind.AsteriskToken:
        return ExpressionType.Multiply;
      case ts.SyntaxKind.SlashToken:
        return ExpressionType.Divide;
      case ts.SyntaxKind.PercentToken:
        return ExpressionType.Modulo;
      case ts.SyntaxKind.EqualsEqualsToken:
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
        return ExpressionType.Equal;
      case ts.SyntaxKind.ExclamationEqualsToken:
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        return ExpressionType.NotEqual;
      case ts.SyntaxKind.GreaterThanToken:
        return ExpressionType.GreaterThan;
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return ExpressionType.GreaterThanOrEqual;
      case ts.SyntaxKind.LessThanToken:
        return ExpressionType.LessThan;
      case ts.SyntaxKind.LessThanEqualsToken:
        return ExpressionType.LessThanOrEqual;
      case ts.SyntaxKind.AmpersandAmpersandToken:
        return ExpressionType.AndAlso;
      case ts.SyntaxKind.BarBarToken:
        return ExpressionType.OrElse;
      default:
        throw new Error(`Operador binário não suportado: ${ts.SyntaxKind[kind]}`);
    }
  }

  /**
   * Mapeia um operador unário TypeScript para um tipo de expressão
   * @param kind O tipo de sintaxe TypeScript
   */
  private mapUnaryOperator(kind: ts.PrefixUnaryOperator): ExpressionType {
    switch (kind) {
      case ts.SyntaxKind.ExclamationToken:
        return ExpressionType.Not;
      case ts.SyntaxKind.MinusToken:
        return ExpressionType.Negate;
      default:
        throw new Error(`Operador unário não suportado: ${ts.SyntaxKind[kind]}`);
    }
  }

  // Adicionar estes métodos à classe LambdaParser existente

  /**
   * Analisa um predicado com suporte a propriedades aninhadas
   */
  parsePredicateWithNesting<T, P = Record<string, any>>(
    predicate: (entity: T, params?: P) => boolean,
    tableAlias: string,
  ): Expression {
    const fnString = predicate.toString();
    this.extractParameterNames(fnString);

    // Parse the function body into an AST
    const node = this.parseLambda(fnString);

    // Process the AST with nested property support
    return this.processNodeWithNesting(node, tableAlias);
  }

  /**
   * Processa um nó AST com suporte a propriedades aninhadas
   */
  private processNodeWithNesting(node: ts.Node, tableAlias: string): Expression {
    // Handle expression statements and return statements
    if (ts.isExpressionStatement(node)) {
      return this.processNodeWithNesting(node.expression, tableAlias);
    }

    if (ts.isReturnStatement(node) && node.expression) {
      return this.processNodeWithNesting(node.expression, tableAlias);
    }

    // Handle binary expressions specially for nested properties
    if (ts.isBinaryExpression(node)) {
      const left = this.processPropertyWithNesting(node.left, tableAlias);
      const right = this.processPropertyWithNesting(node.right, tableAlias);
      const operator = this.mapBinaryOperator(node.operatorToken.kind);

      return this.builder.createBinary(operator, left, right);
    }

    // For logical expressions (AND, OR)
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      const left = this.processNodeWithNesting(node.left, tableAlias);
      const right = this.processNodeWithNesting(node.right, tableAlias);
      const operator = this.mapBinaryOperator(node.operatorToken.kind);

      return this.builder.createBinary(operator, left, right);
    }

    // For prefix unary expressions (e.g., !condition)
    if (ts.isPrefixUnaryExpression(node)) {
      const operand = this.processPropertyWithNesting(node.operand, tableAlias);
      const operator = this.mapUnaryOperator(node.operator);

      return this.builder.createUnary(operator, operand);
    }

    // For parenthesized expressions
    if (ts.isParenthesizedExpression(node)) {
      return this.processNodeWithNesting(node.expression, tableAlias);
    }

    // For call expressions (e.g., includes(), startsWith())
    if (ts.isCallExpression(node)) {
      // Handle method calls on properties
      if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;

        // CORREÇÃO: Caso especial para método includes()
        if (method === 'includes' && node.arguments.length === 1) {
          // Verificar se estamos lidando com um array em um parâmetro
          // Ex: params.allowedStatuses.includes(user.status)

          const objectExpr = node.expression.expression; // Ex: params.allowedStatuses

          // Verificar se o objeto é uma propriedade de parâmetro
          if (
            ts.isPropertyAccessExpression(objectExpr) &&
            ts.isIdentifier(objectExpr.expression) &&
            this.secondParameterName &&
            objectExpr.expression.text === this.secondParameterName
          ) {
            // Obtemos o nome da propriedade do parâmetro
            const paramProperty = objectExpr.name.text; // Ex: allowedStatuses

            // Verificamos se existe no objeto de variáveis e é um array
            if (paramProperty in this.variables && Array.isArray(this.variables[paramProperty])) {
              // O valor a ser verificado (o argumento do includes)
              const valueToCheck = this.processPropertyWithNesting(node.arguments[0], tableAlias);

              // Criamos uma expressão IN
              return this.builder.createBinary(
                ExpressionType.In,
                valueToCheck, // Ex: user.status
                this.builder.createConstant(this.variables[paramProperty]), // O array
              );
            }
          }

          // Caso de string.includes() - Processar normalmente como LIKE
          const object = this.processPropertyWithNesting(node.expression.expression, tableAlias);
          const arg = this.processPropertyWithNesting(node.arguments[0], tableAlias);

          // Converter para SQL LIKE
          const pattern = this.builder.createFunction('CONCAT', [
            this.builder.createConstant('%'),
            arg,
            this.builder.createConstant('%'),
          ]);

          return this.builder.createFunction('LIKE', [object, pattern]);
        }

        // Caso para outros métodos
        const object = this.processPropertyWithNesting(node.expression.expression, tableAlias);
        const args = node.arguments.map(arg => this.processPropertyWithNesting(arg, tableAlias));

        return this.builder.createFunction(method, [object, ...args]);
      }

      // Handle direct function calls
      if (ts.isIdentifier(node.expression)) {
        const functionName = node.expression.text;
        const args = node.arguments.map(arg => this.processPropertyWithNesting(arg, tableAlias));
        return this.builder.createFunction(functionName, args);
      }
    }

    // Delegate to specialized method for property access
    if (ts.isPropertyAccessExpression(node)) {
      return this.processPropertyWithNesting(node, tableAlias);
    }

    // For other node types, use the standard processing
    return this.processNode(node, tableAlias);
  }
  /**
   * Processa uma propriedade potencialmente aninhada
   */
  private processPropertyWithNesting(node: ts.Node, defaultTableAlias: string): Expression {
    // Handle nested property access (e.g., joined.order.amount)
    if (ts.isPropertyAccessExpression(node)) {
      // Extract the full property path
      const propPath = this.extractPropertyPath(node);

      if (
        this.secondParameterName &&
        propPath.length >= 2 &&
        propPath[0] === this.secondParameterName
      ) {
        const propertyName = propPath[1];

        if (propertyName in this.variables) {
          return this.builder.createConstant(this.variables[propertyName]);
        }

        console.warn(`Reference to parameter '${propertyName}' not found in variables`);
        return this.builder.createConstant(null);
      }

      // If we have a nested property (at least 3 parts: parameter.object.property)
      if (propPath.length >= 3 && propPath[0] === this.parameterName) {
        const objectName = propPath[1]; // e.g., "order" or "traducao"
        const propertyName = propPath[propPath.length - 1]; // e.g., "amount" or "arLanguage"

        // Try to resolve the correct table alias using the property tracker
        if (this.propertyTracker) {
          // Strategy 1: Check if the object is directly registered
          const objectSource = this.propertyTracker.getPropertySource(objectName);
          if (objectSource) {
            return this.builder.createColumn(propertyName, objectSource.tableAlias);
          }

          // Strategy 2: Check for wildcard registrations
          const wildcardKey = `${objectName}.*`;
          const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
          if (wildcardSource) {
            return this.builder.createColumn(propertyName, wildcardSource.tableAlias);
          }

          // Strategy 3: Look through all property sources
          for (const [propName, source] of this.propertyTracker.getAllPropertySources().entries()) {
            if (
              propName === objectName ||
              (source.propertyPath && source.propertyPath[0] === objectName)
            ) {
              return this.builder.createColumn(propertyName, source.tableAlias);
            }
          }

          // Strategy 4: Check table aliases directly
          for (const alias of this.propertyTracker.getTableAliases()) {
            if (
              alias === objectName ||
              objectName.charAt(0).toLowerCase() === alias.toLowerCase()
            ) {
              return this.builder.createColumn(propertyName, alias);
            }
          }
        }
      }

      // For simple property access (e.g., entity.property)
      if (propPath.length === 2 && propPath[0] === this.parameterName) {
        return this.builder.createColumn(propPath[1], defaultTableAlias);
      }
    }

    // For literals and other expressions
    if (ts.isLiteralExpression(node)) {
      return this.processLiteral(node);
    }

    // For other node types
    return this.processNode(node, defaultTableAlias);
  }

  /**
   * Verifica se um nó AST representa um literal de objeto
   * @param node O nó AST a ser verificado
   * @returns true se o nó for um literal de objeto, false caso contrário
   */
  isObjectLiteral(node: ts.Node): boolean {
    // Verificar o nó diretamente
    if (ts.isObjectLiteralExpression(node)) {
      return true;
    }

    // Verificar o corpo de uma função de seta
    if (ts.isArrowFunction(node) && node.body && ts.isObjectLiteralExpression(node.body)) {
      return true;
    }

    // Verificar expressão em um statement
    if (ts.isExpressionStatement(node) && ts.isObjectLiteralExpression(node.expression)) {
      return true;
    }

    // Verificar o corpo de um return statement
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      return true;
    }

    // Verificar dentro de parênteses
    if (ts.isParenthesizedExpression(node) && ts.isObjectLiteralExpression(node.expression)) {
      return true;
    }

    // Buscar recursivamente em filhos
    let found = false;
    node.forEachChild(child => {
      if (!found) {
        found = this.isObjectLiteral(child);
      }
    });

    return found;
  }

  /**
   * Processa uma expressão simples (não-objeto) em uma AST
   * @param node O nó AST a ser processado
   * @param tableAlias O alias padrão da tabela
   * @returns Uma expressão adequada para a AST
   */
  processSimpleExpression(node: ts.Node, tableAlias: string): Expression {
    // Processar várias formas possíveis de expressão

    // Se é um bloco de função, encontrar o statement relevante
    if (ts.isBlock(node) && node.statements.length > 0) {
      // Buscar o primeiro return statement, ou o último statement
      const returnStmt = node.statements.find(ts.isReturnStatement);
      if (returnStmt && returnStmt.expression) {
        return this.processSimpleExpression(returnStmt.expression, tableAlias);
      }

      // Se não houver return, processar o último statement
      return this.processSimpleExpression(node.statements[node.statements.length - 1], tableAlias);
    }

    // Se é um return statement, processar a expressão
    if (ts.isReturnStatement(node) && node.expression) {
      return this.processSimpleExpression(node.expression, tableAlias);
    }

    // Se é um statement de expressão, processar a expressão
    if (ts.isExpressionStatement(node)) {
      return this.processSimpleExpression(node.expression, tableAlias);
    }

    // Se é uma função de seta com corpo de expressão, processar o corpo
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      return this.processSimpleExpression(node.body, tableAlias);
    }

    // Processar tipos específicos de expressões

    // 1. Acesso a propriedade (user.id, joined.order.amount)
    if (ts.isPropertyAccessExpression(node)) {
      // Verificar se é uma propriedade aninhada
      const propPath = this.extractPropertyPath(node);

      if (propPath.length > 0) {
        // Verificar propriedades aninhadas (ex: joined.order.amount)
        if (propPath.length >= 3 && this.propertyTracker) {
          const objectName = propPath[1]; // "order"
          const propertyName = propPath[propPath.length - 1]; // "amount"

          // Tentar encontrar a tabela correta no rastreador

          // 1. Verificar registro direto do objeto
          const objectSource = this.propertyTracker.getPropertySource(objectName);
          if (objectSource) {
            return this.builder.createColumn(propertyName, objectSource.tableAlias);
          }

          // 2. Verificar wildcard para este objeto
          const wildcardKey = `${objectName}.*`;
          const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
          if (wildcardSource) {
            return this.builder.createColumn(propertyName, wildcardSource.tableAlias);
          }

          // 3. Verificar correspondência com aliases de tabela
          for (const alias of this.propertyTracker.getTableAliases()) {
            // Correspondência exata ou primeira letra
            if (
              alias === objectName ||
              (objectName.length > 0 && alias.toLowerCase() === objectName[0].toLowerCase())
            ) {
              return this.builder.createColumn(propertyName, alias);
            }
          }
        }

        // Para acesso direto a uma coluna (ex: user.id)
        if (propPath.length === 2 && propPath[0] === this.parameterName) {
          return this.builder.createColumn(propPath[1], tableAlias);
        }
      }

      // Fallback para acesso a propriedade não reconhecido
      return this.processPropertyAccess(node, tableAlias);
    }

    // 2. Constantes
    if (ts.isLiteralExpression(node)) {
      return this.processLiteral(node);
    }

    // 3. Identificadores (variáveis, parâmetros)
    if (ts.isIdentifier(node)) {
      return this.processIdentifier(node, tableAlias);
    }

    // 4. Expressões binárias (a + b, a > b)
    if (ts.isBinaryExpression(node)) {
      return this.processBinaryExpression(node, tableAlias);
    }

    // 5. Chamadas de função (count(), sum())
    if (ts.isCallExpression(node)) {
      return this.processCallExpression(node, tableAlias);
    }

    // 6. Expressões unárias (NOT a, -b)
    if (ts.isPrefixUnaryExpression(node)) {
      return this.processPrefixUnaryExpression(node, tableAlias);
    }

    // 7. Expressões entre parênteses
    if (ts.isParenthesizedExpression(node)) {
      return this.processSimpleExpression(node.expression, tableAlias);
    }

    // Para outros tipos, delegar para o método processNode genérico
    return this.processNode(node, tableAlias);
  }

  /**
   * Extrai os nomes dos parâmetros de uma string de função lambda
   * @param fnString A string da função
   */
  private extractParameterNames(fnString: string): void {
    // Corresponder padrões para um ou dois parâmetros:
    // 1. Função de seta com dois parâmetros: (x, params) => ...
    // 2. Função de seta com um parâmetro: x => ... ou (x) => ...

    // Tentar primeiro capturar dois parâmetros
    const twoParamsMatch = fnString.match(/\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*=>/);

    if (twoParamsMatch) {
      // Capturamos dois parâmetros: (entity, params) => ...
      this.parameterName = twoParamsMatch[1].trim();
      this.secondParameterName = twoParamsMatch[2].trim();
      return;
    }

    // Tentar capturar um único parâmetro
    const oneParamMatch = fnString.match(/\(\s*([^)]*)\s*\)\s*=>|\s*(\w+)\s*=>/);

    if (oneParamMatch) {
      // Usar o nome do parâmetro capturado
      this.parameterName = (oneParamMatch[1] || oneParamMatch[2]).trim();
      this.secondParameterName = null; // Não há segundo parâmetro
    } else {
      // Nome de parâmetro padrão se não pudermos extraí-lo
      this.parameterName = 'entity';
      this.secondParameterName = null;
    }
  }
}
