import { DbSet } from './DbSet';

/**
 * The main entry point for the query builder
 * Manages DbSet instances and provides access to database tables
 */
export class DbContext {
  private dbSets: Map<string, DbSet<any>> = new Map();

  /**
   * Creates a new database context
   */
  constructor() {
    // Could accept connection parameters in a real implementation
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

    // Create a new DbSet
    const dbSet = new DbSet<T>(tableName);
    this.dbSets.set(tableName, dbSet);
    return dbSet;
  }
}
