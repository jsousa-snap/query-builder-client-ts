import { DbContext } from '../core/context/DbContext';
import { User } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  execAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
};

describe('Query Parameters Tests', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
    users = dbContext.set<User>('users');
  });

  test('Where clause with simple parameter', () => {
    // Arrange
    const minAge = 18;

    // Act
    const query = users.withVariables({ minAge }).where((user, params) => user.age > params.minAge);

    const sql = query.toQueryString();

    // Assert
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE ([u].[age] > 18)`);
  });

  test('Where clause with multiple parameters', () => {
    // Arrange
    const filters = {
      minAge: 18,
      isActive: true,
      namePattern: 'John',
    };

    // Act
    const query = users
      .withVariables(filters)
      .where(
        (user, params) =>
          user.age > params.minAge &&
          user.isActive === params.isActive &&
          user.name.includes(params.namePattern),
      );

    const sql = query.toQueryString();

    // Assert
    expect(sql).toContain(`[u].[age] > 18`);
    expect(sql).toContain(`[u].[isActive] = 1`);
    expect(sql).toContain(`[u].[name] LIKE CONCAT(N'%', N'John', N'%')`);
  });

  test('Where clause with typed parameters', () => {
    // Arrange
    interface UserFilters {
      minAge: number;
      maxAge: number;
      status: string[];
      createdAfter: Date;
    }

    const today = new Date();
    const filters: UserFilters = {
      minAge: 18,
      maxAge: 65,
      status: ['active', 'pending'],
      createdAfter: today,
    };

    // Act
    const query = users
      .withVariables(filters)
      .where(
        (user, params: UserFilters) =>
          user.age >= params.minAge &&
          user.age <= params.maxAge &&
          params.status.includes(user.status) &&
          user.createdAt > params.createdAfter,
      );

    const sql = query.toQueryString();

    // Assert
    expect(sql).toContain(`[u].[age] >= 18`);
    expect(sql).toContain(`[u].[age] <= 65`);
    expect(sql).toContain(`[u].[createdAt] > `);
  });

  test('Where clause with combined direct value and parameter', () => {
    // Arrange
    const filters = {
      minAge: 18,
    };

    // Act - Mistura valor direto (25) e valor do parâmetro (minAge)
    const query = users
      .withVariables(filters)
      .where((user, params) => user.age > params.minAge && user.age < 25);

    const sql = query.toQueryString();

    // Assert
    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE (([u].[age] > 18) AND ([u].[age] < 25))`);
  });

  test('Multiple where clauses with parameters', () => {
    // Arrange
    const filters = {
      minAge: 18,
      namePattern: 'John',
    };

    // Act - Encadeando múltiplos where
    const query = users
      .withVariables(filters)
      .where((user, params) => user.age > params.minAge)
      .where((user, params) => user.name.includes(params.namePattern));

    const sql = query.toQueryString();

    // Assert
    expect(sql).toContain(`[u].[age] > 18`);
    expect(sql).toContain(`[u].[name] LIKE CONCAT(N'%', N'John', N'%')`);
    expect(sql).toContain(`AND`); // Verifica se as condições estão combinadas com AND
  });
});
