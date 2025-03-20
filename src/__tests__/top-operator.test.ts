import { DbContext } from '../core/context/DbContext';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

/**
 * Normaliza SQL removendo espaços em branco para comparação
 */
function normalizeSQL(sql: string): string {
  return sql.replace(/\s+/g, '');
}

describe('Operador TOP', () => {
  let dbContext: DbContext;

  // Define alguns modelos de teste
  interface User {
    id: number;
    name: string;
    email: string;
  }

  beforeEach(() => {
    // Cria um contexto novo para cada teste
    dbContext = new DbContext(mockDatabaseProvider);
  });

  test('top() deve adicionar cláusula TOP à consulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users.limit(10).toQueryString();

    // Assert
    expect(query).toEqual(`SELECT TOP 10 *
FROM [users] AS [u]`);
  });

  test('top() combinado com outras cláusulas', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users
      .where(u => u.name.includes('John'))
      .limit(5)
      .orderBy(u => u.id)
      .toQueryString();

    // Assert
    expect(query).toEqual(`SELECT TOP 5 *
FROM [users] AS [u]
WHERE [u].[name] LIKE CONCAT(N'%', N'John', N'%')
ORDER BY [u].[id] ASC`);
  });

  test('top() após select()', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users
      .select(u => ({
        id: u.id,
        name: u.name,
      }))
      .limit(3)
      .toQueryString();

    // Assert
    expect(query).toEqual(`SELECT TOP 3 [u].[id] AS [id], [u].[name] AS [name]
FROM [users] AS [u]`);
  });

  test('top() chamado diretamente do DbSet', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users
      .limit(20)
      .where(u => u.id > 100)
      .toQueryString();

    // Assert
    expect(query).toEqual(`SELECT TOP 20 *
FROM [users] AS [u]
WHERE ([u].[id] > 100)`);
  });
});
