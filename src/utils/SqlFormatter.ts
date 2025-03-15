/**
 * SqlFormatter.ts
 * Formatador avançado de SQL com suporte para estilo específico do cliente
 */

/**
 * Opções de formatação para o SQL
 */
export interface SqlFormatterOptions {
  /** Tamanho da indentação (padrão: 2) */
  indentSize?: number;
  /** Converter palavras-chave para maiúsculas (padrão: true) */
  uppercase?: boolean;
  /** Comprimento máximo de colunas para alinhamento (padrão: 30) */
  maxColumnLength?: number;
  /** Aplicar destaque de sintaxe nas palavras-chave (padrão: true) */
  highlightKeywords?: boolean;
  /** Usar cores ANSI para saída no terminal (padrão: auto-detectado) */
  colorOutput?: boolean;
  /** Manter cláusula ON na mesma linha que o JOIN (padrão: false) */
  inlineOn?: boolean;
  /** Manter tabela na mesma linha após FROM (padrão: true) */
  inlineFrom?: boolean;
  /** Colocar vírgulas no início da linha, não no final (padrão: false) */
  leadingCommas?: boolean;
  /** Colocar AND/OR no início da próxima linha (true) ou no final da linha anterior (false) */
  leadingLogicalOps?: boolean;
}

/**
 * Formata uma consulta SQL para melhor visualização e legibilidade
 *
 * @param sql Consulta SQL para formatar
 * @param options Opções de formatação
 * @returns Consulta SQL formatada
 */
export function formatSQL(sql: string, options: SqlFormatterOptions = {}): string {
  // Opções padrão
  const opts = {
    indentSize: options.indentSize || 2,
    uppercase: options.uppercase !== false, // Padrão: true
    maxColumnLength: options.maxColumnLength || 30,
    highlightKeywords: options.highlightKeywords !== false, // Padrão: true
    colorOutput:
      options.colorOutput !== false &&
      typeof process !== 'undefined' &&
      process.stdout &&
      process.stdout.isTTY, // Só usa cores no terminal
    inlineOn: options.inlineOn || false, // Padrão: false (quebrar ON em linha separada)
    inlineFrom: options.inlineFrom !== false, // Padrão: true (tabela na mesma linha do FROM)
    leadingCommas: options.leadingCommas || false, // Padrão: false (vírgulas no final da linha)
    leadingLogicalOps: options.leadingLogicalOps !== false, // Padrão: true (AND/OR no início da linha)
  };

  // Cores ANSI para destaque
  const colors = {
    keyword: '\x1b[1;36m', // Ciano brilhante
    function: '\x1b[1;33m', // Amarelo brilhante
    number: '\x1b[1;35m', // Magenta brilhante
    string: '\x1b[1;32m', // Verde brilhante
    operator: '\x1b[1;37m', // Branco brilhante
    reset: '\x1b[0m', // Reset
  };

  // Se não quiser cores, use strings vazias
  if (!opts.colorOutput) {
    Object.keys(colors).forEach(key => {
      colors[key as keyof typeof colors] = '';
    });
  }

  // Lista de palavras-chave SQL para destacar
  const keywords = [
    'SELECT',
    'FROM',
    'WHERE',
    'JOIN',
    'INNER JOIN',
    'LEFT JOIN',
    'RIGHT JOIN',
    'FULL JOIN',
    'ON',
    'GROUP BY',
    'ORDER BY',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'AS',
    'AND',
    'OR',
    'NOT',
    'IN',
    'BETWEEN',
    'LIKE',
    'IS NULL',
    'IS NOT NULL',
    'EXISTS',
    'UNION',
    'ALL',
    'DISTINCT',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'END',
    'WITH',
    'VALUES',
    'INTO',
  ];

  // Lista de funções SQL para destacar
  const functions = [
    'COUNT',
    'SUM',
    'AVG',
    'MIN',
    'MAX',
    'COALESCE',
    'NULLIF',
    'CAST',
    'CONCAT',
    'SUBSTR',
    'TRIM',
    'LOWER',
    'UPPER',
    'DATE',
    'EXTRACT',
  ];

  // Função para destacar palavra-chave
  const highlightKeyword = (text: string): string => {
    if (!opts.highlightKeywords) return text;

    // Converter para maiúsculas se configurado
    if (opts.uppercase) {
      text = text.toUpperCase();
    }

    return `${colors.keyword}${text}${colors.reset}`;
  };

  // Função para destacar função SQL
  const highlightFunction = (text: string): string => {
    if (!opts.highlightKeywords) return text;

    // Converter para maiúsculas se configurado
    if (opts.uppercase) {
      text = text.toUpperCase();
    }

    return `${colors.function}${text}${colors.reset}`;
  };

  // Escapa uma string para uso seguro em SQL
  const escapeSqlString = (value: string): string => {
    return value.replace(/'/g, "''");
  };

  // Preprocessamento: normalizar espaços e converter para minúsculas para processamento
  let normalizedSQL = sql.trim().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')');

  // Criar espaço de indentação base
  const indent = ' '.repeat(opts.indentSize);
  const doubleIndent = ' '.repeat(opts.indentSize * 2);
  const tripleIndent = ' '.repeat(opts.indentSize * 3);

  // Converter para maiúsculas se configurado
  let formattedSQL = normalizedSQL;

  // Array para armazenar as linhas formatadas
  const lines: string[] = [];

  // Processar as principais cláusulas SQL
  let clauses = formattedSQL.split(
    /\b(SELECT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET)\b/i,
  );
  let indentLevel = 0;
  let inSubquery = false;
  let openParens = 0;

  // Processar cada parte da consulta
  for (let i = 0; i < clauses.length; i++) {
    let clause = clauses[i].trim();

    // Pular cláusulas vazias
    if (!clause) continue;

    // Detectar início e fim de subconsulta
    // Contar parênteses para rastrear o nível de aninhamento
    const openParensCount = (clause.match(/\(/g) || []).length;
    const closeParensCount = (clause.match(/\)/g) || []).length;
    openParens += openParensCount - closeParensCount;

    // Verificar se é uma palavra-chave SQL
    const isKeyword = keywords.some(keyword => clause.toUpperCase() === keyword);

    // Processar cláusulas principais
    if (isKeyword) {
      // Resetar indentação para palavras-chave principais
      indentLevel = 0;

      // Adicionar palavra-chave com quebra de linha
      lines.push(`\n${highlightKeyword(clause)}`);
    }
    // Processar conteúdo da cláusula SELECT
    else if (i > 0 && clauses[i - 1].toUpperCase() === 'SELECT') {
      // Processar campos na cláusula SELECT
      let fields = clause.split(',');

      // Processar cada campo na cláusula SELECT
      for (let j = 0; j < fields.length; j++) {
        let field = fields[j].trim();

        // Detectar e formatar funções de agregação
        for (const func of functions) {
          const funcRegex = new RegExp(`\\b${func}\\s*\\(`, 'i');
          if (funcRegex.test(field)) {
            field = field.replace(new RegExp(`\\b${func}\\b`, 'i'), match =>
              highlightFunction(match),
            );
          }
        }

        // Tratar aliases no SELECT
        if (field.toUpperCase().includes(' AS ')) {
          const parts = field.split(/\s+AS\s+/i);
          field = `${parts[0]} ${highlightKeyword('AS')} ${parts[1]}`;
        }

        // Adicionar campo formatado com vírgula conforme opção leadingCommas
        if (j === 0) {
          // Primeiro campo, nunca tem vírgula no início
          lines.push(`${indent}${field}`);
        } else if (opts.leadingCommas) {
          // Vírgula no início da linha
          lines.push(`${indent}, ${field}`);
        } else {
          // Vírgula no final da linha anterior
          lines[lines.length - 1] += ',';
          lines.push(`${indent}${field}`);
        }
      }
    }
    // Processar conteúdo da cláusula FROM
    else if (i > 0 && clauses[i - 1].toUpperCase() === 'FROM') {
      // Primeiro, processa a tabela principal
      const joinPattern = /\b(INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|JOIN)\b/i;
      const parts = clause.split(joinPattern);

      // A primeira parte é sempre a tabela principal
      let mainTable = parts[0].trim();
      if (mainTable.includes(' AS ')) {
        const tableParts = mainTable.split(/\s+AS\s+/i);
        mainTable = `${tableParts[0]} ${highlightKeyword('AS')} ${tableParts[1]}`;
      }

      // Adicionar tabela principal com indentação adequada - baseado na opção inlineFrom
      if (opts.inlineFrom) {
        // Na mesma linha que o FROM, com espaço simples
        lines[lines.length - 1] += ` ${mainTable}`;
      } else {
        // Em linha separada
        lines.push(`${indent}`); // Linha vazia após FROM
        lines.push(`${mainTable}`);
      }

      // Processar cada JOIN separadamente
      for (let j = 1; j < parts.length; j += 2) {
        if (j + 1 >= parts.length) break;

        const joinType = parts[j].trim();
        let joinTable = parts[j + 1].trim();

        // Distinguir entre a tabela e a condição ON
        const onParts = joinTable.split(/\bON\b/i);

        if (onParts.length >= 2) {
          const tablePart = onParts[0].trim();
          const conditionPart = onParts.slice(1).join(' ON ').trim();

          // Formatar a parte da tabela
          let formattedTable = tablePart;
          if (formattedTable.includes(' AS ')) {
            const tableParts = formattedTable.split(/\s+AS\s+/i);
            formattedTable = `${tableParts[0]} ${highlightKeyword('AS')} ${tableParts[1]}`;
          }

          // Se inlineOn é true, mantém ON na mesma linha
          if (opts.inlineOn) {
            lines.push(
              `${indent}${highlightKeyword(joinType)} ${formattedTable} ${highlightKeyword('ON')} ${conditionPart}`,
            );
          } else {
            lines.push(`${indent}${highlightKeyword(joinType)} ${formattedTable}`);
            lines.push(`${doubleIndent}${highlightKeyword('ON')} ${conditionPart}`);
          }
        } else {
          // Se não houver ON, apenas adiciona a tabela
          lines.push(`${indent}${highlightKeyword(joinType)} ${joinTable}`);
        }
      }
    }
    // Processar conteúdo da cláusula WHERE
    else if (i > 0 && clauses[i - 1].toUpperCase() === 'WHERE') {
      // Processar condições WHERE
      let conditions = clause.split(/\b(AND|OR)\b/i);

      for (let j = 0; j < conditions.length; j++) {
        let condition = conditions[j].trim();
        if (!condition) continue;

        if (condition.toUpperCase() === 'AND' || condition.toUpperCase() === 'OR') {
          const logicalOp = highlightKeyword(condition);

          if (opts.leadingLogicalOps) {
            // AND/OR no início da próxima linha
            if (j + 1 < conditions.length && conditions[j + 1].trim()) {
              // Se há uma próxima condição, combine o operador com ela
              const nextCondition = conditions[j + 1].trim();
              lines.push(`${indent}${logicalOp} ${nextCondition}`);
              j++; // Pular a próxima condição, já processada
            } else {
              // Se não há próxima condição, adicione o operador sozinho
              lines.push(`${indent}${logicalOp}`);
            }
          } else {
            // AND/OR no final da linha atual
            if (lines.length > 0) {
              lines[lines.length - 1] += ` ${logicalOp}`;
            } else {
              lines.push(`${indent}${logicalOp}`);
            }
          }
        } else if (j === 0 || !opts.leadingLogicalOps) {
          // Primeira condição ou quando operadores lógicos não estão no início
          lines.push(`${indent}${condition}`);
        }
        // Quando operadores lógicos estão no início, as condições são processadas junto com eles
      }
    }
    // Processar outras cláusulas
    else if (
      i > 0 &&
      ['GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET'].includes(clauses[i - 1].toUpperCase())
    ) {
      lines.push(`${indent}${clause}`);
    }
    // Processar subconsultas e outras partes
    else {
      // Tratar parênteses e subconsultas
      if (openParens > 0) {
        // Aumentar indentação para subconsultas
        indentLevel = openParens;
        lines.push(`${indent.repeat(indentLevel)}${clause}`);
      } else {
        lines.push(`${indent}${clause}`);
      }
    }
  }

  // Juntar todas as linhas
  return lines.join('\n');
}

/**
 * Versão formatador SQL simples
 *
 * @param sql Consulta SQL para formatar
 * @param inlineOn Manter cláusula ON na mesma linha que o JOIN (padrão: false)
 * @param leadingCommas Colocar vírgulas no início da linha (padrão: false)
 * @returns Consulta SQL formatada de forma simples
 */
export function formatSQLSimple(
  sql: string,
  inlineOn: boolean = false,
  inlineFrom: boolean = true,
  leadingCommas: boolean = false,
): string {
  // Preprocessar para normalizar espaços
  let normalizedSql = sql.replace(/\s+/g, ' ').trim();

  // Base de substituições comuns
  let result = normalizedSql
    .replace(/SELECT/gi, '\nSELECT')
    .replace(/GROUP BY/gi, '\nGROUP BY\n  ')
    .replace(/HAVING/gi, '\nHAVING\n  ')
    .replace(/ORDER BY/gi, '\nORDER BY\n  ')
    .replace(/LIMIT/gi, '\nLIMIT ')
    .replace(/OFFSET/gi, '\nOFFSET ');

  // Tratar FROM com base na opção inlineFrom
  if (inlineFrom) {
    result = result.replace(/FROM/gi, '\nFROM ');
  } else {
    result = result.replace(/FROM/gi, '\nFROM\n');
  }

  // Tratar WHERE sem quebrar o AND
  result = result.replace(/WHERE\s+/gi, '\nWHERE\n  ');

  // Tratar separação de campos com base no estilo de vírgulas
  if (leadingCommas) {
    // Vírgulas no início da linha
    result = result.replace(/,\s+/g, '\n  , ');
  } else {
    // Vírgulas no final da linha
    result = result.replace(/,\s+/g, ',\n  ');
  }

  // Tratar AND/OR no final de cada linha
  result = result.replace(/\b(AND|OR)\b\s+/gi, ' $1 ');

  // Tratar JOINs com base na opção inlineOn
  if (inlineOn) {
    // Para cada tipo de JOIN, precisamos manter a condição ON na mesma linha
    result = result.replace(/\b(INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|JOIN)\b/gi, '\n  $1');
  } else {
    result = result
      .replace(/\b(INNER JOIN)\b/gi, '\n  INNER JOIN\n    ')
      .replace(/\b(LEFT JOIN)\b/gi, '\n  LEFT JOIN\n    ')
      .replace(/\b(RIGHT JOIN)\b/gi, '\n  RIGHT JOIN\n    ')
      .replace(/\b(FULL JOIN)\b/gi, '\n  FULL JOIN\n    ')
      .replace(/\b(JOIN)\b/gi, '\n  JOIN\n    ')
      .replace(/\bON\b/gi, 'ON\n      ');
  }

  // Garantir que após SELECT temos uma indentação
  result = result.replace(/\nSELECT\s+/g, '\nSELECT\n  ');

  return result;
}

/**
 * Formatador rápido que reproduz exatamente o estilo do cliente
 *
 * @param sql Consulta SQL para formatar
 * @returns Consulta SQL formatada no estilo do cliente
 */
export function formatSQLClientStyle(sql: string): string {
  return formatSQL(sql, {
    leadingCommas: false,
    inlineOn: true,
    inlineFrom: true,
    leadingLogicalOps: false,
    colorOutput: false,
  });
}
