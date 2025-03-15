// src/core/query/LambdaParser.ts (aprimorado)
import * as ts from 'typescript';
import { Expression, ExpressionType } from '../expressions/Expression';
import { ExpressionBuilder } from './ExpressionBuilder';
import { PropertyTracker } from './PropertyTracker';
import { ColumnExpression } from '../expressions/ColumnExpression';

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

  /**
   * Analisa uma função de predicado em uma árvore de expressões
   * @param predicate A função de predicado (por exemplo, x => x.id === 1)
   * @param tableAlias O alias para a tabela
   */
  parsePredicate<T>(predicate: (entity: T) => boolean, tableAlias: string): Expression {
    const fnString = predicate.toString();
    this.extractParameterName(fnString);

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

    // Analisar o corpo da função em uma AST
    const node = this.parseLambda(fnString);

    // Encontrar o literal de objeto no corpo da função
    let objectLiteral = this.findObjectLiteral(node);

    if (!objectLiteral) {
      throw new Error('Esperava-se uma expressão literal de objeto na função select');
    }

    const result = new Map<string, PropertyMapping>();

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
   */
  private parseLambda(fnString: string): ts.Node {
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

    // Padrão: converter para uma constante
    return this.builder.createConstant(node.getText());
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
    // Extrair o caminho completo da propriedade
    const propPath = this.extractPropertyPath(node);

    // Se não temos um caminho de propriedade (isso não deveria acontecer)
    if (propPath.length === 0) {
      return this.builder.createColumn(node.name.text, tableAlias);
    }

    // Criar a string do caminho completo para consulta no PropertyTracker
    const fullPropertyPath = propPath.join('.');

    // Se temos um PropertyTracker, tentar usá-lo para resolver a origem da propriedade
    if (this.propertyTracker) {
      const source = this.propertyTracker.getPropertySource(fullPropertyPath);

      if (source) {
        // Temos informações de origem para esta propriedade ou caminho
        return this.builder.createColumn(source.columnName, source.tableAlias);
      }
    }

    // Caso 1: Verificar se este é um acesso direto ao parâmetro lambda
    if (propPath[0] === this.parameterName) {
      // É uma referência de coluna direta do parâmetro
      const columnName = propPath[propPath.length - 1];
      return this.builder.createColumn(columnName, tableAlias);
    }

    // Caso 2: Verificar acesso a propriedades aninhadas em dois níveis
    // Exemplo: joined.order.amount
    if (propPath.length >= 3 && this.propertyTracker) {
      // Verificar se o primeiro nível é reconhecido
      const firstLevelSource = this.propertyTracker.getPropertySource(propPath[0]);

      if (firstLevelSource) {
        // Verificar se o segundo nível tem um registro específico
        const secondLevelKey = `${propPath[0]}.${propPath[1]}`;
        const secondLevelSource = this.propertyTracker.getPropertySource(secondLevelKey);

        if (secondLevelSource) {
          // Temos informação sobre o segundo nível, usar o alias dele
          return this.builder.createColumn(
            propPath[propPath.length - 1],
            secondLevelSource.tableAlias,
          );
        }

        // Se não temos informação sobre o segundo nível, verificar wildcards
        const wildcardKey = `${propPath[0]}.*`;
        const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);

        if (wildcardSource) {
          // Usar o alias do wildcard para o segundo nível
          return this.builder.createColumn(
            propPath[propPath.length - 1],
            wildcardSource.tableAlias,
          );
        }
      }

      // Caso específico: buscar por registros que mapeiam o segundo nível diretamente
      // Verificando se algum registro tem o mesmo nome do segundo nível e um alias de tabela
      for (const source of this.propertyTracker.getAllPropertySources().values()) {
        if (source.propertyPath && source.propertyPath[0] === propPath[1]) {
          return this.builder.createColumn(propPath[propPath.length - 1], source.tableAlias);
        }
      }
    }

    // Caso 3: Tentar avaliar a expressão dinamicamente (para variáveis, etc.)
    const propertyName = node.name.text;
    const object = this.evaluateExpression(node.expression);

    if (object !== undefined && object !== null) {
      // Retornar o valor da propriedade como constante
      return this.builder.createConstant(object[propertyName]);
    }

    // Caso 4: Fallback para propriedades não rastreadas
    // Isso assume que qualquer acesso a propriedade está referenciando uma coluna
    // Esta é uma suposição arriscada, mas é o melhor que podemos fazer sem mais informações
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

      // Lidar com string.includes() -> LIKE
      if (method === 'includes' && args.length === 1) {
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
        return ExpressionType.And;
      case ts.SyntaxKind.BarBarToken:
        return ExpressionType.Or;
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
  parsePredicateWithNesting<T>(predicate: (entity: T) => boolean, tableAlias: string): Expression {
    const fnString = predicate.toString();
    this.extractParameterName(fnString);

    // Analisar o corpo da função em uma AST
    const node = this.parseLambda(fnString);

    // Converter a AST em uma árvore de expressões, com suporte a aninhamento
    return this.processNodeWithNesting(node, tableAlias);
  }

  /**
   * Processa um nó AST com suporte a propriedades aninhadas
   */
  private processNodeWithNesting(node: ts.Node, tableAlias: string): Expression {
    // Processar diferentes tipos de nós, semelhante ao processNode original
    // mas com suporte adicional para propriedades aninhadas

    // Tratar um caso específico: propriedade aninhada em expressão binária
    if (ts.isBinaryExpression(node)) {
      const left = this.processPropertyWithNesting(node.left, tableAlias);
      const right = this.processPropertyWithNesting(node.right, tableAlias);
      const operator = this.mapBinaryOperator(node.operatorToken.kind);

      return this.builder.createBinary(operator, left, right);
    }

    // Para os demais tipos, usar o processamento padrão
    return this.processNode(node, tableAlias);
  }

  /**
   * Processa uma propriedade potencialmente aninhada
   */
  private processPropertyWithNesting(node: ts.Node, defaultTableAlias: string): Expression {
    // Caso especial: acesso a propriedade aninhada como joined.order.amount
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      // Extrair as partes da expressão aninhada
      const property = node.name.text; // "amount"
      const objectExpr = node.expression; // "joined.order"

      if (ts.isPropertyAccessExpression(objectExpr)) {
        const objectName = objectExpr.name.text; // "order"

        // Verificar se temos informações sobre este objeto no PropertyTracker
        if (this.propertyTracker) {
          // Tentar como objeto direto
          const objectSource = this.propertyTracker.getPropertySource(objectName);
          if (objectSource) {
            return this.builder.createColumn(property, objectSource.tableAlias);
          }

          // Tentar como wildcard
          const wildcardKey = `${objectName}.*`;
          const wildcardSource = this.propertyTracker.getPropertySource(wildcardKey);
          if (wildcardSource) {
            return this.builder.createColumn(property, wildcardSource.tableAlias);
          }

          // Verificar correspondência com aliases de tabela
          for (const alias of this.propertyTracker.getTableAliases()) {
            if (
              alias === objectName ||
              objectName.charAt(0).toLowerCase() === alias.toLowerCase()
            ) {
              return this.builder.createColumn(property, alias);
            }
          }
        }
      }
    }

    // Para os demais casos, usar o processamento padrão
    return this.processNode(node, defaultTableAlias);
  }
}
