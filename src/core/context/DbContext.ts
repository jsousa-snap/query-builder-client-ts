// src/core/context/DbContext.ts
import { DbSet } from './DbSet';

/**
 * The main entry point for the query builder
 * Manages DbSet instances and provides access to database tables
 */
export class DbContext {
  private dbSets: Map<string, DbSet<any>> = new Map();
  private usedAliases: Set<string> = new Set<string>();

  /**
   * Creates a new database context
   */
  constructor() {
    // Could accept connection parameters in a real implementation
  }

  /**
   * Generates a unique alias for a table
   * @param tableName The table name
   * @returns A unique alias
   */
  private generateUniqueAlias(tableName: string): string {
    let baseAlias = tableName.charAt(0).toLowerCase();
    let alias = baseAlias;
    let counter = 1;

    while (this.usedAliases.has(alias)) {
      alias = `${baseAlias}${counter}`;
      counter++;
    }

    this.usedAliases.add(alias);
    return alias;
  }

  /**
   * Gets or creates a DbSet for the specified table
   * @param tableName The name of the database table
   * @returns A DbSet for the table
   */
  set<T = any>(tableName: string): DbSet<T> {
    // Check if we already have a DbSet for this table
    if (this.dbSets.has(tableName)) {
      return this.dbSets.get(tableName) as DbSet<T>;
    }

    // Generate a unique alias
    const alias = this.generateUniqueAlias(tableName);

    // Create a new DbSet with the unique alias
    const dbSet = new DbSet<T>(tableName, alias);
    this.dbSets.set(tableName, dbSet);
    return dbSet;
  }
}
