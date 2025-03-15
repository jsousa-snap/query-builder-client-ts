module.exports = {
  env: {
    node: true,
    es2020: true, // Habilita recursos modernos como const, let, etc.
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    // Desabilita regras que poderiam causar problemas em arquivos JS
    'no-const-assign': 'error',
    'no-var': 'warn', // Recomenda o uso de const/let em vez de var
    'prefer-const': 'warn',
  },
};
