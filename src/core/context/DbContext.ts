import { IDatabaseProvider } from '../query/Types';
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
  constructor(private readonly provider: IDatabaseProvider) {
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
  set<T = any>(tableName: string, customAlias?: string): DbSet<T> {
    // Determinar qual alias usar
    const alias = customAlias ? customAlias : this.generateUniqueAlias(tableName);

    // Se tentarmos usar um alias já em uso, geramos um erro
    if (customAlias && this.usedAliases.has(customAlias)) {
      throw new Error(`Alias "${customAlias}" already in use. Please choose a different alias.`);
    }

    // Criar ID único para tabela+alias
    const setId = `${tableName}_${alias}`;

    // Check if we already have a DbSet for this table+alias combination
    if (this.dbSets.has(setId)) {
      return this.dbSets.get(setId) as DbSet<T>;
    }

    // Se estamos usando um alias customizado, registrá-lo para evitar duplicatas
    if (customAlias) {
      this.usedAliases.add(customAlias);
    }

    // Create a new DbSet with the alias
    const dbSet = new DbSet<T>(this.provider, tableName, alias);
    this.dbSets.set(setId, dbSet);
    return dbSet;
  }
}
