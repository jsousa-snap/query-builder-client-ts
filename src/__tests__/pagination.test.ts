import { ExpressionSerializer } from '../utils/ExpressionSerializer';
import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
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

    expect(normalizeSQL(sql)).toContain(normalizeSQL('SELECT * FROM users AS u LIMIT 10'));
  });

  test('Offset results', () => {
    const query = users.offset(20);
    const sql = query.toQueryString();

    const metadata = ExpressionSerializer.serialize(query.toMetadata());

    expect(normalizeSQL(sql)).toContain(normalizeSQL('SELECT * FROM users AS u OFFSET 20'));
  });

  test('Limit and offset combined', () => {
    const query = users.limit(15).offset(30);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT * FROM users AS u LIMIT 15 OFFSET 30'),
    );
  });

  test('Pagination with order by', () => {
    const query = users
      .orderBy(u => u.name)
      .limit(10)
      .offset(20);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT * 
        FROM users AS u 
        ORDER BY u.name ASC 
        LIMIT 10 
        OFFSET 20
      `),
    );
  });

  test('Pagination with where clause', () => {
    const query = users
      .where(u => u.age > 18)
      .limit(5)
      .offset(10);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT * 
        FROM users AS u 
        WHERE (u.age > 18) 
        LIMIT 5 
        OFFSET 10
      `),
    );
  });

  test('Pagination with join', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .limit(8)
      .offset(16);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT * 
        FROM users AS u 
        INNER JOIN orders AS o ON (u.id = o.userId) 
        LIMIT 8 
        OFFSET 16
      `),
    );
  });
});
