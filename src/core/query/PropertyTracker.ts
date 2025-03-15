// src/core/query/PropertyTracker.ts (aprimorado)

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
  /** Indicador se é uma propriedade composta (objeto ou expressão complexa) */
  isCompound?: boolean;
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

    const isCompound = columnName === '*' || propertyPath !== undefined;

    this.propertyMap.set(propertyName, {
      tableAlias,
      tableName,
      columnName,
      propertyPath,
      isCompound,
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
   * Obtém a origem de uma propriedade, com suporte aprimorado para propriedades aninhadas
   * @param propertyPath Caminho da propriedade, pode ser simples ("name") ou aninhado ("order.amount")
   */
  getPropertySource(propertyPath: string): PropertySource | undefined {
    // Verificar primeiro se existe a propriedade exatamente como foi solicitada
    const directMatch = this.propertyMap.get(propertyPath);
    if (directMatch) {
      return directMatch;
    }

    // Se não houver correspondência direta, verificar se é um caminho aninhado
    const pathParts = propertyPath.split('.');

    if (pathParts.length > 1) {
      // É um caminho aninhado, buscar o objeto raiz
      const rootObject = pathParts[0];
      const rootSource = this.propertyMap.get(rootObject);

      if (rootSource && rootSource.isCompound) {
        // Encontrou o objeto raiz, verificar se temos um padrão wildcard para ele
        const wildcardKey = `${rootObject}.*`;
        const wildcardSource = this.propertyMap.get(wildcardKey);

        if (wildcardSource) {
          // O objeto tem um mapeamento de wildcard, retornar com a propriedade final
          return {
            tableAlias: wildcardSource.tableAlias,
            tableName: wildcardSource.tableName,
            columnName: pathParts[pathParts.length - 1],
            propertyPath: pathParts,
            isCompound: false,
          };
        }

        // Se não tiver wildcard, tentar inferir pelo objeto raiz
        return {
          tableAlias: rootSource.tableAlias,
          tableName: rootSource.tableName,
          columnName: pathParts[pathParts.length - 1],
          propertyPath: pathParts,
          isCompound: false,
        };
      }

      // Tentar buscar direto pelo objeto secundário se tiver dois níveis
      // Ex: order.amount -> verificar se há registro para "amount" com alias da tabela de orders
      if (pathParts.length === 2) {
        // Buscar todos os registros e ver se algum bate com o objeto raiz
        for (const [propName, source] of this.propertyMap.entries()) {
          if (propName === pathParts[1] || source.columnName === pathParts[1]) {
            // É uma possível correspondência, verificar se há outro registro para
            // o objeto raiz que aponte para a mesma tabela
            for (const [rootPropName, rootSource] of this.propertyMap.entries()) {
              if (rootPropName === rootObject && rootSource.tableAlias === source.tableAlias) {
                // Encontramos uma correspondência provável
                return source;
              }
            }
          }
        }
      }
    }

    // Se chegou aqui, não encontrou correspondência
    return undefined;
  }

  /**
   * Verifica se uma propriedade existe
   */
  hasProperty(propertyName: string): boolean {
    // Verificar correspondência direta
    if (this.propertyMap.has(propertyName)) {
      return true;
    }

    // Verificar propriedades aninhadas
    return this.getPropertySource(propertyName) !== undefined;
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

  /**
   * Obtém todos os aliases de tabela registrados
   * @returns Array com todos os aliases de tabela
   */
  getTableAliases(): string[] {
    return Array.from(this.tableAliasMap.keys());
  }

  /**
   * Obtém o mapa de aliases de tabela
   * @returns Mapa de aliases para nomes de tabela
   */
  getTableAliasMap(): Map<string, string> {
    return new Map(this.tableAliasMap);
  }

  /**
   * Imprime o conteúdo do rastreador para depuração
   */
  dump(): string {
    let result = '=== PropertyTracker Dump ===\n';

    result += 'Tables:\n';
    for (const [alias, tableName] of this.tableAliasMap.entries()) {
      result += `  ${alias} -> ${tableName}\n`;
    }

    result += 'Properties:\n';
    for (const [propName, source] of this.propertyMap.entries()) {
      result += `  ${propName} -> ${source.tableAlias}.${source.columnName}`;
      if (source.propertyPath) {
        result += ` (path: ${source.propertyPath.join('.')})`;
      }
      if (source.isCompound) {
        result += ` (compound)`;
      }
      result += '\n';
    }

    return result;
  }
}
