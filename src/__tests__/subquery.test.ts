import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order, Product } from './common/models';
import { DbSet } from '../core/context/DbSet';

describe('Subquery Queries', () => {
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

  test('Subquery in select', () => {
    const query = users
      .select(user => ({
        userId: user.id,
        name: user.name,
      }))
      .withSubquery(
        'totalOrders',
        orders,
        user => user.userId,
        order => order.userId,
        query => query.count(),
      );
    const sql = query.toQueryString();

    expect(sql).toContain(
      `SELECT
  u.id AS userId,
  u.name AS name,
  (
SELECT
  COUNT(*) AS count
FROM orders AS o
WHERE
  (o.userId = u.id)) AS totalOrders
FROM users AS u`,
    );
  });

  // Subquery para filtros ainda não implementado
  //   test('Correlated subquery in where clause', () => {
  //     const query = users.where(
  //       user => orders.where(o => o.userId === user.id && o.amount > 100).count() > 0,
  //     );
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL(`
  //         SELECT * FROM users AS u
  //         WHERE (
  //           (SELECT COUNT(*) FROM orders AS o WHERE ((o.userId = u.id) AND (o.amount > 100))) > 0
  //         )
  //       `),
  //     );
  //   });

  //   test('Nested subquery', () => {
  //     const query = users.select(user => ({
  //       name: user.name,
  //       highValueOrders: orders
  //         .where(
  //           o =>
  //             o.userId === user.id && products.where(p => p.id === o.id && p.price > 500).count() > 0,
  //         )
  //         .count(),
  //     }));
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL(`
  //         SELECT
  //           u.name AS name,
  //           (
  //             SELECT COUNT(*)
  //             FROM orders AS o
  //             WHERE (
  //               (o.userId = u.id) AND
  //               (
  //                 (SELECT COUNT(*) FROM products AS p WHERE ((p.id = o.id) AND (p.price > 500))) > 0
  //               )
  //             )
  //           ) AS highValueOrders
  //         FROM users AS u
  //       `),
  //     );
  //   });

  test('Subquery with aggregation', () => {
    const query = users
      .select(user => ({
        userId: user.id,
        name: user.name,
      }))
      .withSubquery(
        'maxOrderAmount',
        orders,
        user => user.userId,
        order => order.userId,
        query => query.max(o => o.amount),
      );
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT 
          u.id AS userId, 
          u.name AS name, 
          (SELECT MAX(o.amount) FROM orders AS o WHERE (o.userId = u.id)) AS maxOrderAmount 
        FROM users AS u
      `),
    );
  });

  test('Complex subquery with multiple conditions', () => {
    const query = users
      .select(user => ({
        userId: user.id,
        name: user.name,
      }))
      .withSubquery(
        'activeOrders',
        orders,
        user => user.userId,
        order => order.userId,
        query => query.where(o => o.status === 'active' && o.amount > 100).count(),
      );
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT 
          u.name AS name, 
          (
            SELECT COUNT(*) 
            FROM orders AS o 
            WHERE (
              (o.userId = u.id) AND 
              (o.status = 'active') AND 
              (o.amount > 100)
            )
          ) AS activeOrders 
        FROM users AS u
      `),
    );
  });
});
