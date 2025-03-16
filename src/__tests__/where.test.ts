import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User } from './common/models';
import { DbSet } from '../core/context/DbSet';

describe('Where Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;

  beforeEach(() => {
    dbContext = new DbContext();
    users = dbContext.set<User>('users');
  });

  test('Simple equality condition', () => {
    const query = users.where(u => u.age === 18);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT * FROM users AS u WHERE (u.age = 18)'),
    );
  });

  test('Greater than condition', () => {
    const query = users.where(u => u.age > 18);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT * FROM users AS u WHERE (u.age > 18)'),
    );
  });

  test('Multiple conditions with AND', () => {
    const query = users.where(u => u.age > 18 && u.isActive === true);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT * FROM users AS u WHERE ((u.age > 18) AND (u.isActive = 1))'),
    );
  });

  test('Multiple conditions with OR', () => {
    const query = users.where(u => u.age < 18 || u.name.includes('Junior'));
    const sql = query.toQueryString();

    expect(sql).toContain(
      `SELECT
  *
FROM users AS u
WHERE
  ((u.age < 18) OR
  LIKE(u.name, CONCAT('%', 'Junior', '%')))`,
    );
  });

  test('String contains condition', () => {
    const query = users.where(u => u.name.includes('John'));
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`SELECT * FROM users AS u WHERE LIKE(u.name, CONCAT('%', 'John', '%'))`),
    );
  });

  test('Null condition', () => {
    const query = users.where(u => u.email === null);
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT * FROM users AS u WHERE (u.email = NULL)'),
    );
  });
});
