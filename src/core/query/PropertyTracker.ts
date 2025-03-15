// src/core/query/PropertyTracker.ts

/**
 * Interface que representa a origem de uma propriedade
 */
export interface PropertySource {
  /** Alias da tabela de origem */
  tableAlias: string;
  /** Nome da tabela original */
  tableName: string;
  /** Nome da coluna na tabela */
  columnName: string;
  /** Caminho para a propriedade no objeto aninhado (se aplicável) */
  propertyPath?: string[];
}

/**
 * Classe responsável por rastrear a origem das propriedades em uma consulta
 */
export class PropertyTracker {
  /** Mapa de propriedades e suas origens */
  private propertyMap: Map<string, PropertySource> = new Map();

  /** Mapas dos aliases de tabela para seus nomes originais */
  private tableAliasMap: Map<string, string> = new Map();

  /**
   * Registra uma tabela e seu alias
   */
  registerTable(tableName: string, alias: string): void {
    this.tableAliasMap.set(alias, tableName);
  }

  /**
   * Registra uma propriedade e sua origem
   */
  registerProperty(
    propertyName: string,
    tableAlias: string,
    columnName: string,
    propertyPath?: string[],
  ): void {
    const tableName = this.tableAliasMap.get(tableAlias);
    if (!tableName) {
      throw new Error(`Table alias "${tableAlias}" não está registrado`);
    }

    this.propertyMap.set(propertyName, {
      tableAlias,
      tableName,
      columnName,
      propertyPath,
    });
  }

  /**
   * Registra várias propriedades de uma vez
   */
  registerProperties(
    properties: Record<string, { tableAlias: string; columnName: string; propertyPath?: string[] }>,
  ): void {
    for (const [propertyName, { tableAlias, columnName, propertyPath }] of Object.entries(
      properties,
    )) {
      this.registerProperty(propertyName, tableAlias, columnName, propertyPath);
    }
  }

  /**
   * Obtém a origem de uma propriedade
   */
  getPropertySource(propertyName: string): PropertySource | undefined {
    return this.propertyMap.get(propertyName);
  }

  /**
   * Verifica se uma propriedade existe
   */
  hasProperty(propertyName: string): boolean {
    return this.propertyMap.has(propertyName);
  }

  /**
   * Obtém todas as propriedades associadas a um alias de tabela
   */
  getPropertiesByTableAlias(tableAlias: string): Map<string, PropertySource> {
    const result = new Map<string, PropertySource>();

    for (const [propertyName, source] of this.propertyMap.entries()) {
      if (source.tableAlias === tableAlias) {
        result.set(propertyName, source);
      }
    }

    return result;
  }

  /**
   * Mescla outro rastreador de propriedades neste
   */
  merge(other: PropertyTracker): void {
    // Mesclar aliases de tabela
    for (const [alias, tableName] of other.tableAliasMap.entries()) {
      this.tableAliasMap.set(alias, tableName);
    }

    // Mesclar mapeamento de propriedades
    for (const [propertyName, source] of other.propertyMap.entries()) {
      this.propertyMap.set(propertyName, source);
    }
  }

  /**
   * Clona este rastreador de propriedades
   */
  clone(): PropertyTracker {
    const tracker = new PropertyTracker();

    // Copiar aliases de tabela
    for (const [alias, tableName] of this.tableAliasMap.entries()) {
      tracker.tableAliasMap.set(alias, tableName);
    }

    // Copiar mapeamento de propriedades
    for (const [propertyName, source] of this.propertyMap.entries()) {
      tracker.propertyMap.set(propertyName, { ...source });
    }

    return tracker;
  }

  /**
   * Obtém o mapa completo de propriedades
   */
  getAllPropertySources(): Map<string, PropertySource> {
    return new Map(this.propertyMap);
  }

  /**
   * Cria um novo rastreador com prefixo para propriedades aninhadas
   */
  withPrefix(prefix: string): PropertyTracker {
    const tracker = new PropertyTracker();

    // Copiar aliases de tabela
    for (const [alias, tableName] of this.tableAliasMap.entries()) {
      tracker.tableAliasMap.set(alias, tableName);
    }

    // Prefixar todas as propriedades
    for (const [propertyName, source] of this.propertyMap.entries()) {
      const newPropertyName = `${prefix}.${propertyName}`;
      const newPropertyPath = source.propertyPath ? [prefix, ...source.propertyPath] : [prefix];

      tracker.propertyMap.set(newPropertyName, {
        ...source,
        propertyPath: newPropertyPath,
      });
    }

    return tracker;
  }
}
