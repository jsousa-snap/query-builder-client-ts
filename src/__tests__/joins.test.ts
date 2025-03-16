import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order, Product } from './common/models';
import { JoinType } from '../core/expressions/JoinExpression';
import { DbSet } from '../core/context/DbSet';

describe('Join Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;
  let products: DbSet<Product>;

  beforeEach(() => {
    dbContext = new DbContext();
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
    products = dbContext.set<Product>('products');
  });

  test('Simple inner join', () => {
    const query = users.join(
      orders,
      user => user.id,
      order => order.userId,
      (user, order) => ({ user, order }),
    );
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT * FROM users AS u INNER JOIN orders AS o ON (u.id = o.userId)'),
    );
  });

  test('Join with column selection', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .select(joined => ({
        userName: joined.user.name,
        orderAmount: joined.order.amount,
      }));
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(
        'SELECT u.name AS userName, o.amount AS orderAmount FROM users AS u INNER JOIN orders AS o ON (u.id = o.userId)',
      ),
    );
  });

  test('Multiple joins', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .join(
        products,
        joined => joined.order.id,
        product => product.id,
        (joined, product) => ({
          ...joined,
          product,
        }),
      );
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT * 
        FROM users AS u 
        INNER JOIN orders AS o ON (u.id = o.userId) 
        INNER JOIN products AS p ON (o.id = p.id)
      `),
    );
  });

  test('Left join', () => {
    const query = users.join(
      orders,
      user => user.id,
      order => order.userId,
      (user, order) => ({ user, order }),
      JoinType.LEFT,
    );
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT * FROM users AS u LEFT JOIN orders AS o ON (u.id = o.userId)'),
    );
  });

  test('Join with nested property access', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({
          userDetails: {
            id: user.id,
            name: user.name,
          },
          orderInfo: {
            id: order.id,
            amount: order.amount,
          },
        }),
      )
      .select(joined => ({
        userId: joined.userDetails.id,
        userName: joined.userDetails.name,
        orderAmount: joined.orderInfo.amount,
      }));
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT 
          u.id AS userId, 
          u.name AS userName, 
          o.amount AS orderAmount 
        FROM users AS u 
        INNER JOIN orders AS o ON (u.id = o.userId)
      `),
    );
  });
});
