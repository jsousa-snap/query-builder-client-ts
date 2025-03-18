/**
 * Utilitário para normalização de SQL
 * Remove espaços desnecessários e padroniza a formatação para comparação consistente
 */
export function normalizeSQL(sql: string): string {
  return sql
    .replace(/\n+/g, ' ') // Substituir múltiplas quebras de linha por um único espaço
    .replace(/\s+/g, ' ') // Substituir múltiplos espaços em branco por um único espaço
    .replace(/\s*\(\s*/g, '(') // Remover espaços antes e depois de parênteses de abertura
    .replace(/\s*\)\s*/g, ')') // Remover espaços antes e depois de parênteses de fechamento
    .replace(/\s*\[\s*/g, '[') // Remover espaços antes e depois de colchetes de abertura
    .replace(/\s*\]\s*/g, ']') // Remover espaços antes e depois de colchetes de fechamento
    .replace(/\s*,\s*/g, ',') // Remover espaços antes e depois de vírgulas
    .replace(/\s*=\s*/g, '=') // Remover espaços antes e depois de sinais de igual
    .replace(/\s*>\s*/g, '>') // Remover espaços antes e depois de sinais de maior
    .replace(/\s*<\s*/g, '<') // Remover espaços antes e depois de sinais de menor
    .replace(/\s*>=\s*/g, '>=') // Remover espaços antes e depois de sinais de maior ou igual
    .replace(/\s*<=\s*/g, '<=') // Remover espaços antes e depois de sinais de menor ou igual
    .replace(/\s*<>\s*/g, '<>') // Remover espaços antes e depois de sinais de diferente
    .replace(/\s*!=\s*/g, '!=') // Remover espaços antes e depois de sinais de diferente (alternativo)
    .replace(/\s*\+\s*/g, '+') // Remover espaços antes e depois de sinais de adição
    .replace(/\s*\-\s*/g, '-') // Remover espaços antes e depois de sinais de subtração
    .replace(/\s*\*\s*/g, '*') // Remover espaços antes e depois de sinais de multiplicação
    .replace(/\s*\/\s*/g, '/') // Remover espaços antes e depois de sinais de divisão
    .trim(); // Remover espaços no início e no final
}
