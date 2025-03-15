// src/core/query/PropertyMapping.ts
export interface PropertyMapping {
  // Nome da propriedade no resultado
  property: string;
  // Alias da tabela à qual a propriedade pertence
  tableAlias: string;
  // Propriedades aninhadas (para objetos resultantes de joins)
  nestedProperties?: Map<string, PropertyMapping>;
}
