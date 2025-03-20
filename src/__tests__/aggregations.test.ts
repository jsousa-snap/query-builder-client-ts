import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';
import { ExpressionSerializer } from '../utils/ExpressionSerializer';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

describe('Aggregation Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
  });

  test('Count total records', () => {
    const query = users.count();
    const sql = query.toQueryString();

    const metadata = JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2);

    expect(sql).toEqual(`SELECT COUNT(*) AS [count]
FROM [users] AS [u]`);
  });

  test('Count specific column', () => {
    const query = users.count(u => u.id);
    const sql = query.toQueryString();

    const metadata = JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2);

    expect(sql).toEqual(`SELECT COUNT([u].[id]) AS [count]
FROM [users] AS [u]`);
  });

  test('Average calculation', () => {
    const query = users.avg(u => u.age);
    const sql = query.toQueryString();
    const metadata = JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2);
    expect(sql).toEqual(`SELECT AVG([u].[age]) AS [avg]
FROM [users] AS [u]`);
  });

  test('Maximum value', () => {
    const query = users.max(u => u.age);
    const sql = query.toQueryString();

    const metadata = JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2);

    expect(sql).toEqual(`SELECT MAX([u].[age]) AS [max]
FROM [users] AS [u]`);
  });

  test('Minimum value', () => {
    const query = users.min(u => u.age);
    const sql = query.toQueryString();

    const metadata = JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2);

    expect(sql).toEqual(`SELECT MIN([u].[age]) AS [min]
FROM [users] AS [u]`);
  });

  test('Sum calculation', () => {
    const query = orders.sum(o => o.amount);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT SUM([o].[amount]) AS [sum]
FROM [orders] AS [o]`);
  });

  test('Aggregation with where clause', () => {
    const query = users.where(u => u.age > 18).avg(u => u.age);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT AVG([u].[age]) AS [avg]
FROM [users] AS [u]
WHERE ([u].[age] > 18)`);
  });

  test('Aggregation with where clause and join', () => {
    const query = users
      .where(u => u.age > 18)
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({
          user,
          order,
        }),
      )
      .where(joined => joined.order.amount > 100)
      .avg(joined => joined.order.amount);
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT AVG([o].[amount]) AS [avg]
FROM [users] AS [u]
INNER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])
WHERE (([u].[age] > 18) AND ([o].[amount] > 100))`);
  });
});
