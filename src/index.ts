/**
 * TypeScript Query Builder
 * A lightweight ORM with AST analysis for generating SQL queries
 *
 * @packageDocumentation
 */

// Main exports
export { DbContext } from './core/context/DbContext';
export { DbSet } from './core/context/DbSet';
export { Queryable } from './core/query/Queryable';

// Enums
export { OrderDirection } from './core/query/Types';
export { JoinType } from './core/expressions/JoinExpression';
export { ExpressionType } from './core/expressions/Expression';

// Visitor
export { SqlGenerationVisitor } from './core/visitors/SqlGenerationVisitor';

// Expression types - export these for advanced usage
export {
  Expression,
  IBinaryExpression as BinaryExpression,
  IUnaryExpression as UnaryExpression,
  IColumnExpression as ColumnExpression,
  IConstantExpression as ConstantExpression,
  IFunctionExpression as FunctionExpression,
  ISelectExpression as SelectExpression,
  ITableExpression as TableExpression,
  IJoinExpression as JoinExpression,
  IScalarSubqueryExpression as SubqueryExpression,
  IProjectionExpression as ProjectionExpression,
  IParameterExpression as ParameterExpression,
} from './core/expressions/Expression';
