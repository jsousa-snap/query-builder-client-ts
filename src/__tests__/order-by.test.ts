import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order } from './common/models';
import { IDatabaseProvider, OrderDirection } from '../core/query/Types';
import { DbSet } from '../core/context/DbSet';

const mockDatabaseProvider: IDatabaseProvider = {
  execAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
};

describe('Order By Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
  });

  test('Order by single column ascending', () => {
    const query = users.orderBy(u => u.name);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
ORDER BY [u].[name] ASC`);
  });

  test('Order by single column descending', () => {
    const query = users.orderBy(u => u.age, OrderDirection.DESC);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
ORDER BY [u].[age] DESC`);
  });

  test('Multiple order by columns', () => {
    const query = users.orderBy(u => u.age, OrderDirection.DESC).orderBy(u => u.name);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
ORDER BY [u].[age] DESC, [u].[name] ASC`);
  });

  test('Order by with nested join', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .orderBy(joined => joined.order.amount, OrderDirection.DESC);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
INNER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])
ORDER BY [o].[amount] DESC`);
  });

  test('Order by with selection', () => {
    const query = users
      .orderBy(u => u.name)
      .select(u => ({
        userId: u.id,
        userName: u.name,
      }));

    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT [u].[id] AS [userId], [u].[name] AS [userName]
FROM [users] AS [u]
ORDER BY [u].[name] ASC`);
  });

  test('Order by with where clause', () => {
    const query = users.where(u => u.age > 18).orderBy(u => u.name, OrderDirection.DESC);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
WHERE ([u].[age] > 18)
ORDER BY [u].[name] DESC`);
  });
});
