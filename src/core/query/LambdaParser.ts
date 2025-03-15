import * as ts from 'typescript';
import { Expression, ExpressionType } from '../expressions/Expression';
import { ExpressionBuilder } from './ExpressionBuilder';

/**
 * Parses TypeScript lambda expressions into expression trees
 */
export class LambdaParser {
  private readonly builder: ExpressionBuilder;
  private readonly variables: Record<string, any>;
  private parameterName: string = '';

  /**
   * Creates a new lambda parser
   * @param builder The expression builder to use
   * @param variables Variables that can be used in the lambda
   */
  constructor(builder: ExpressionBuilder, variables: Record<string, any> = {}) {
    this.builder = builder;
    this.variables = variables;
  }

  /**
   * Parses a predicate function into an expression tree
   * @param predicate The predicate function (e.g., x => x.id === 1)
   * @param tableAlias The alias for the table
   */
  parsePredicate<T>(predicate: (entity: T) => boolean, tableAlias: string): Expression {
    const fnString = predicate.toString();
    this.extractParameterName(fnString);

    // Parse the function body into an AST
    const node = this.parseLambda(fnString);

    // Convert the AST to an expression tree
    return this.processNode(node, tableAlias);
  }

  /**
   * Parses a selector function into an object with column mappings
   * @param selector The selector function (e.g., x => ({ id: x.id, name: x.name }))
   * @param tableAlias The alias for the table
   */
  parseSelector<T, TResult>(
    selector: (entity: T) => TResult,
    tableAlias: string,
  ): Map<string, Expression> {
    const fnString = selector.toString();
    this.extractParameterName(fnString);

    // Parse the function body into an AST
    const node = this.parseLambda(fnString);

    // Convert the AST to a map of property name -> expression
    return this.processProjection(node, tableAlias);
  }

  /**
   * Extracts the parameter name from a lambda function string
   * @param fnString The function string
   */
  private extractParameterName(fnString: string): void {
    // Match parameter patterns:
    // 1. Arrow function: (x) => ... or x => ...
    // 2. Function expression: function(x) { ... }
    const paramMatch = fnString.match(/\(\s*([^)]*)\s*\)\s*=>|\s*(\w+)\s*=>/);

    if (paramMatch) {
      // Use the captured parameter name
      this.parameterName = (paramMatch[1] || paramMatch[2]).trim();
    } else {
      // Default parameter name if we couldn't extract it
      this.parameterName = 'entity';
    }
  }

  /**
   * Parses a lambda function string into an AST
   * @param fnString The function string
   */
  private parseLambda(fnString: string): ts.Node {
    // Determine if this is an arrow function or function expression
    const isArrow = fnString.includes('=>');

    // Extract the function body
    let functionBody = '';

    if (isArrow) {
      // Arrow function: extract everything after =>
      const bodyStart = fnString.indexOf('=>') + 2;
      functionBody = fnString.substring(bodyStart).trim();

      // If the body doesn't start with {, wrap it with return
      if (!functionBody.startsWith('{')) {
        functionBody = `return ${functionBody}`;
      } else {
        // Remove the outer {}
        functionBody = functionBody.substring(1, functionBody.length - 1).trim();
      }
    } else {
      // Function expression: extract everything between { and }
      const bodyStart = fnString.indexOf('{') + 1;
      const bodyEnd = fnString.lastIndexOf('}');
      functionBody = fnString.substring(bodyStart, bodyEnd).trim();
    }

    // Create a source file for parsing
    const sourceFile = ts.createSourceFile(
      'expression.ts',
      functionBody,
      ts.ScriptTarget.Latest,
      true,
    );

    // Return the first statement of the function body
    return sourceFile.statements[0];
  }

  /**
   * Processes an AST node and converts it to an expression tree
   * @param node The AST node
   * @param tableAlias The alias for the table
   */
  private processNode(node: ts.Node, tableAlias: string): Expression {
    // Process different types of nodes
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

    // Default: convert to a constant
    return this.builder.createConstant(node.getText());
  }

  /**
   * Processes a binary expression node
   * @param node The binary expression node
   * @param tableAlias The alias for the table
   */
  private processBinaryExpression(node: ts.BinaryExpression, tableAlias: string): Expression {
    // Get the operator
    const operator = this.mapBinaryOperator(node.operatorToken.kind);

    // Process left and right operands
    const left = this.processNode(node.left, tableAlias);
    const right = this.processNode(node.right, tableAlias);

    // Create a binary expression
    return this.builder.createBinary(operator, left, right);
  }

  /**
   * Maps a TypeScript binary operator to an expression type
   * @param kind The TypeScript syntax kind
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
        throw new Error(`Unsupported binary operator: ${ts.SyntaxKind[kind]}`);
    }
  }

  /**
   * Processes a prefix unary expression node
   * @param node The prefix unary expression node
   * @param tableAlias The alias for the table
   */
  private processPrefixUnaryExpression(
    node: ts.PrefixUnaryExpression,
    tableAlias: string,
  ): Expression {
    // Get the operator
    const operator = this.mapUnaryOperator(node.operator);

    // Process the operand
    const operand = this.processNode(node.operand, tableAlias);

    // Create a unary expression
    return this.builder.createUnary(operator, operand);
  }

  /**
   * Maps a TypeScript unary operator to an expression type
   * @param kind The TypeScript syntax kind
   */
  private mapUnaryOperator(kind: ts.PrefixUnaryOperator): ExpressionType {
    switch (kind) {
      case ts.SyntaxKind.ExclamationToken:
        return ExpressionType.Not;
      case ts.SyntaxKind.MinusToken:
        return ExpressionType.Negate;
      default:
        throw new Error(`Unsupported unary operator: ${ts.SyntaxKind[kind]}`);
    }
  }

  /**
   * Processes a property access expression node
   * @param node The property access expression node
   * @param tableAlias The alias for the table
   */
  private processPropertyAccess(node: ts.PropertyAccessExpression, tableAlias: string): Expression {
    // Check if this is a property of our parameter
    if (ts.isIdentifier(node.expression) && node.expression.text === this.parameterName) {
      // This is a column reference
      return this.builder.createColumn(node.name.text, tableAlias);
    }

    // Otherwise, try to evaluate the expression
    const propertyName = node.name.text;
    const object = this.evaluateExpression(node.expression);

    if (object !== undefined && object !== null) {
      // Return the property value
      return this.builder.createConstant(object[propertyName]);
    }

    // If we can't evaluate, create a column expression as a fallback
    // This assumes that any property access is referencing a column
    return this.builder.createColumn(propertyName, tableAlias);
  }

  /**
   * Processes an identifier node
   * @param node The identifier node
   * @param tableAlias The alias for the table
   */
  private processIdentifier(node: ts.Identifier, tableAlias: string): Expression {
    const name = node.text;

    // Check if this is our parameter
    if (name === this.parameterName) {
      // This is a reference to the entire entity - not common in SQL
      // For now, just return a reference to the table
      return this.builder.createConstant(`${tableAlias}`);
    }

    // Check if this is a context variable
    if (name in this.variables) {
      // It's a variable, return its value
      return this.builder.createConstant(this.variables[name]);
    }

    // Otherwise, assume it's a column (though this is probably an error)
    return this.builder.createColumn(name, tableAlias);
  }

  /**
   * Processes a literal expression node
   * @param node The literal expression node
   */
  private processLiteral(node: ts.LiteralExpression): Expression {
    // Handle different types of literals
    if (ts.isStringLiteral(node)) {
      return this.builder.createConstant(node.text);
    }

    if (ts.isNumericLiteral(node)) {
      return this.builder.createConstant(Number(node.text));
    }

    // Handle true/false keywords
    if (node.kind === ts.SyntaxKind.TrueKeyword) {
      return this.builder.createConstant(true);
    }

    if (node.kind === ts.SyntaxKind.FalseKeyword) {
      return this.builder.createConstant(false);
    }

    // Handle null keyword
    if (node.kind === ts.SyntaxKind.NullKeyword) {
      return this.builder.createConstant(null);
    }

    // Default: convert to string
    return this.builder.createConstant(node.getText());
  }

  /**
   * Processes a call expression node
   * @param node The call expression node
   * @param tableAlias The alias for the table
   */
  private processCallExpression(node: ts.CallExpression, tableAlias: string): Expression {
    // Handle method calls like string.includes(), array.some(), etc.
    if (ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const object = this.processNode(node.expression.expression, tableAlias);
      const args = node.arguments.map(arg => this.processNode(arg, tableAlias));

      // Handle string.includes() -> LIKE
      if (method === 'includes' && args.length === 1) {
        // Convert to SQL LIKE
        const pattern = this.builder.createFunction('CONCAT', [
          this.builder.createConstant('%'),
          args[0],
          this.builder.createConstant('%'),
        ]);

        return this.builder.createFunction('LIKE', [object, pattern]);
      }

      // Handle other methods - could add more here
      // ...

      // Default: convert to a function call
      return this.builder.createFunction(method, [object, ...args]);
    }

    // Handle direct function calls
    if (ts.isIdentifier(node.expression)) {
      const functionName = node.expression.text;
      const args = node.arguments.map(arg => this.processNode(arg, tableAlias));

      // Handle SQL functions
      if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(functionName.toUpperCase())) {
        return this.builder.createFunction(functionName.toUpperCase(), args);
      }

      // Default: convert to a function call
      return this.builder.createFunction(functionName, args);
    }

    // Handle other cases - could be a complex expression
    return this.builder.createConstant(node.getText());
  }

  /**
   * Processes a projection expression (object literal in the select function)
   * @param node The AST node
   * @param tableAlias The alias for the table
   */
  private processProjection(node: ts.Node, tableAlias: string): Map<string, Expression> {
    const result = new Map<string, Expression>();

    // Find the object literal expression in the function body
    let objectLiteral: ts.ObjectLiteralExpression | null = null;

    // Function to recursively search for an object literal
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

      // For arrow functions with implicit return of object literals
      if (ts.isArrowFunction(node) && node.body && ts.isObjectLiteralExpression(node.body)) {
        return node.body;
      }

      // Recursive search in children
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
      throw new Error('Expected an object literal expression in select function');
    }

    // Process each property in the object literal
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
   * Attempts to evaluate a TypeScript expression to get its runtime value
   * @param node The AST node to evaluate
   */
  private evaluateExpression(node: ts.Node): any {
    // This is a simplified evaluator - a real one would be more complex

    // Handle identifiers (variables)
    if (ts.isIdentifier(node)) {
      const name = node.text;

      // Check if it's in our variables
      if (name in this.variables) {
        return this.variables[name];
      }

      return undefined;
    }

    // Handle literals
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

    // For other expressions, we'd need a full JavaScript evaluator
    // This is a complex topic - for now, we'll return undefined
    return undefined;
  }
}
