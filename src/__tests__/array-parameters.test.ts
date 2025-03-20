import { DbContext } from '../core/context/DbContext';
import { Order, User } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

describe('Array Parameters Tests', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
  });

  test('Where clause with array.includes check', () => {
    // Arrange
    const allowedStatuses = ['active', 'pending', 'verified'];

    // Act
    const query = users
      .withVariables({ allowedStatuses })
      .where((user, params) => params.allowedStatuses.includes(user.status));

    const sql = query.toQueryString();

    // Assert - Verifica se a consulta usa IN corretamente
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE [u].[status] IN (N'active', N'pending', N'verified')`);
  });

  test('Where clause with negated array.includes check', () => {
    // Arrange
    const blockedStatuses = ['inactive', 'banned', 'suspended'];

    // Act
    const query = users
      .withVariables({ blockedStatuses })
      .where((user, params) => !params.blockedStatuses.includes(user.status));

    const sql = query.toQueryString();

    // Assert - Verifica se a negação funciona corretamente
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE NOT ([u].[status] IN (N'inactive', N'banned', N'suspended'))`);
  });

  test('Where clause with multiple array parameters', () => {
    // Arrange
    const allowedStatuses = ['active', 'pending'];
    const allowedRoles = ['admin', 'moderator', 'editor'];

    // Act
    const query = users
      .withVariables({ allowedStatuses, allowedRoles })
      .where(
        (user, params) =>
          params.allowedStatuses.includes(user.status) && params.allowedRoles.includes(user.role),
      );

    const sql = query.toQueryString();

    // Assert - Verifica se múltiplos arrays funcionam
    expect(sql).toContain(`[u].[status] IN (N'active', N'pending')`);
    expect(sql).toContain(`[u].[role] IN (N'admin', N'moderator', N'editor')`);
  });

  test('Where clause with array.includes and other conditions', () => {
    // Arrange
    const allowedStatuses = ['active', 'pending'];
    const minAge = 18;

    // Act
    const query = users
      .withVariables({ allowedStatuses, minAge })
      .where(
        (user, params) => params.allowedStatuses.includes(user.status) && user.age >= params.minAge,
      );

    const sql = query.toQueryString();

    // Assert - Verifica combinação de array e condições normais
    expect(sql).toContain(`[u].[status] IN (N'active', N'pending')`);
    expect(sql).toContain(`[u].[age] >= 18`);
  });

  test('Where clause with empty array', () => {
    // Arrange
    const allowedStatuses: string[] = [];

    // Act
    const query = users
      .withVariables({ allowedStatuses })
      .where((user, params) => params.allowedStatuses.includes(user.status));

    const sql = query.toQueryString();

    // Assert - Uma condição que nunca será verdadeira
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE [u].[status] IN ()`);
  });

  test('Where clause with array of numbers', () => {
    // Arrange
    const allowedIds = [1, 2, 3, 5, 8, 13];

    // Act
    const query = users
      .withVariables({ allowedIds })
      .where((user, params) => params.allowedIds.includes(user.id));

    const sql = query.toQueryString();

    // Assert - Verifica se funciona com números
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE [u].[id] IN (1, 2, 3, 5, 8, 13)`);
  });

  test('Where clause with array of mixed types', () => {
    // Arrange - Na prática, evite misturar tipos em arrays
    const values = [1, 'active', true, null];

    // Act
    const query = users
      .withVariables({ values })
      .where((user, params) => params.values.includes(user.id));

    const sql = query.toQueryString();

    // Assert - Verifica como lida com tipos misturados
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE [u].[id] IN (1, N'active', 1, NULL)`);
  });

  test('Subquery Where clause with array of mixed types', () => {
    // Arrange - Na prática, evite misturar tipos em arrays
    const values = [1, 'active', true, null];

    // Act
    const query = users.withVariables({ values }).whereIn(
      user => user.id,
      orders
        .withVariables({ values })
        .where((order, params) => params.values.includes(order.userId))
        .select(order => order.userId),
    );

    const sql = query.toQueryString();

    // Assert - Verifica como lida com tipos misturados
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE [u].[id] IN (
  (SELECT
    [o].[userId]
    FROM [orders] AS [o]
    WHERE [o].[userId] IN (1, N'active', 1, NULL)))`);
  });
});
