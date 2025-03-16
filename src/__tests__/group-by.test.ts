import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order } from './common/models';
import { DbSet } from '../core/context/DbSet';

describe('Group By Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;

  beforeEach(() => {
    dbContext = new DbContext();
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
  });

  test('Group by single column', () => {
    const query = users
      .groupBy(u => [u.age])
      .select(g => ({
        age: g.age,
      }));
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT u.age AS age FROM users AS u GROUP BY u.age'),
    );
  });

  //   test('Group by multiple columns', () => {
  //     const query = users
  //       .groupBy(u => [u.age, u.isActive])
  //       .select(g => ({
  //         age: g.age,
  //         isActive: g.isActive,
  //         count: users.count(),
  //       }));
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL(
  //         'SELECT u.age AS age, u.isActive AS isActive, COUNT(*) AS count FROM users AS u GROUP BY u.age, u.isActive',
  //       ),
  //     );
  //   });

  //   test('Group by with having clause', () => {
  //     const query = users
  //       .groupBy(u => [u.age])
  //       .having(g => g.count > 5) // having nao tratado
  //       .select(g => ({
  //         age: g.age,
  //         count: users.count(),
  //       }));
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL(
  //         'SELECT u.age AS age, COUNT(*) AS count FROM users AS u GROUP BY u.age HAVING (COUNT(*) > 5)',
  //       ),
  //     );
  //   });

  //   test('Group by with aggregation', () => {
  //     const query = users
  //       .groupBy(u => [u.age])
  //       .select(g => ({
  //         age: g.age,
  //         averageAge: users.avg(u => u.age),
  //       }));
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL('SELECT u.age AS age, AVG(u.age) AS averageAge FROM users AS u GROUP BY u.age'),
  //     );
  //   });

  // Funcoes apos o groupBy não tratadas
  //   test('Group by with join and aggregation', () => {
  //     const query = users
  //       .join(
  //         orders,
  //         user => user.id,
  //         order => order.userId,
  //         (user, order) => ({ user, order }),
  //       )
  //       .groupBy(joined => [joined.user.age])
  //       .select(g => ({
  //         age: g.age,
  //         totalAmount: orders.sum(o => o.amount),
  //       }));
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL(`
  //         SELECT u.age AS age,
  //                SUM(o.amount) AS totalAmount
  //         FROM users AS u
  //         INNER JOIN orders AS o ON (u.id = o.userId)
  //         GROUP BY u.age
  //       `),
  //     );
  //   });

  //   test('Group by with complex having condition', () => {
  //     const query = users
  //       .groupBy(u => [u.age])
  //       .having(g => g.count > 5 && g.averageAge > 25)
  //       .select(g => ({
  //         age: g.age,
  //         count: users.count(),
  //         averageAge: users.avg(u => u.age),
  //       }));
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL(`
  //         SELECT u.age AS age,
  //                COUNT(*) AS count,
  //                AVG(u.age) AS averageAge
  //         FROM users AS u
  //         GROUP BY u.age
  //         HAVING ((COUNT(*) > 5) AND (AVG(u.age) > 25))
  //       `),
  //     );
  //   });

  //   test('Group by with order by', () => {
  //     const query = users
  //       .groupBy(u => [u.age])
  //       .orderBy(g => g.count, OrderDirection.DESC)
  //       .select(g => ({
  //         age: g.age,
  //         count: users.count(),
  //       }));
  //     const sql = query.toQueryString();

  //     expect(normalizeSQL(sql)).toContain(
  //       normalizeSQL(`
  //         SELECT u.age AS age,
  //                COUNT(*) AS count
  //         FROM users AS u
  //         GROUP BY u.age
  //         ORDER BY count DESC
  //       `),
  //     );
  //   });
});
