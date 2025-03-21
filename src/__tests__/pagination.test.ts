import { ExpressionSerializer } from '../utils/ExpressionSerializer';
import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  execAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
};

describe('Pagination Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
  });

  test('Limit results', () => {
    const query = users.limit(10);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT TOP 10 *
FROM [users] AS [u]`);
  });

  test('Offset results', () => {
    const query = users.orderBy(u => u.age).offset(20);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
ORDER BY [u].[age] ASC
OFFSET 20 ROWS`);
  });

  test('Limit and offset combined', () => {
    const query = users
      .orderBy(u => u.age)
      .limit(15)
      .offset(30);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
ORDER BY [u].[age] ASC
OFFSET 30 ROWS
FETCH NEXT 15 ROWS ONLY`);
  });

  test('Pagination with where clause', () => {
    const query = users
      .where(u => u.age > 18)
      .orderBy(u => u.age)
      .limit(5)
      .offset(10);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE ([u].[age] > 18)
ORDER BY [u].[age] ASC
OFFSET 10 ROWS
FETCH NEXT 5 ROWS ONLY`);
  });

  test('Pagination with join', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .orderBy(joined => joined.user.age)
      .limit(8)
      .offset(16);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
INNER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])
ORDER BY [u].[age] ASC
OFFSET 16 ROWS
FETCH NEXT 8 ROWS ONLY`);
  });
});
