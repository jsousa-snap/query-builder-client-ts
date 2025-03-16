/**
 * Utilitário para normalização de SQL
 * Remove espaços e converte para minúsculas para comparação
 */
export function normalizeSQL(sql: string): string {
  return sql
    .replace(/\n+/g, ' ') // Substituir múltiplas quebras de linha por um único espaço
    .replace(/\s+/g, ' ') // Substituir múltiplos espaços em branco por um único espaço
    .trim(); // Remover espaços no início e no final
}
