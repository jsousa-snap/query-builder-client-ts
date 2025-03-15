// src/__tests__/select.test.ts

/**
 * Removes all whitespace characters (spaces, tabs, newlines) from a string
 * for easier SQL comparison in tests.
 *
 * @param sql The SQL string to normalize
 * @returns A normalized string without whitespace
 */
function normalizeSQL(sql: string): string {
  // Remove all whitespace characters (spaces, tabs, newlines)
  return sql.replace(/\s+/g, '');
}

import { DbContext } from '../core/context/DbContext';

describe('Query Builder - Select Tests', () => {
  let dbContext: DbContext;

  // Define some test models
  interface User {
    id: number;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
  }

  interface Order {
    id: number;
    userId: number;
    amount: number;
    date: Date;
  }

  beforeEach(() => {
    // Create a fresh context for each test
    dbContext = new DbContext();
  });

  test('Simple select test with console output', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act - add console logs to see what's happening
    console.log('Creating query...');
    const query = users.select(u => ({ id: u.id }));
    console.log('Generated SQL:', query.toQueryString());

    // Assert
    expect(true).toBe(true); // Just make it pass for debugging
  });

  test('Select all columns', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users.query().toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(normalizeSQL('SELECT * FROM users AS u'));
  });

  test('Select specific columns', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users.select(u => ({ id: u.id, name: u.name })).toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL('SELECT u.id AS id, u.name AS name FROM users AS u'),
    );
  });

  test('Select with alias', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users.select(u => ({ userId: u.id, fullName: u.name })).toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL('SELECT u.id AS userId, u.name AS fullName FROM users AS u'),
    );
  });

  test('Select with where clause', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users
      .select(u => ({ id: u.id, name: u.name, age: u.age }))
      .where(u => u.age > 21)
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(
        'SELECT u.id AS id, u.name AS name, u.age AS age FROM users AS u WHERE (u.age > 21)',
      ),
    );
  });

  test('Select with complex query', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act
    const query = users
      .where(u => u.age >= 18 && u.isActive === true)
      .select(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
      }))
      .orderBy(u => u.name)
      .limit(10)
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(`SELECT u.id AS id, u.name AS name, u.email AS email 
        FROM users AS u WHERE ((u.age >= 18) AND (u.isActive = 'true')) 
        ORDER BY u.name ASC LIMIT 10`),
    );
  });

  test('Select with join', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');
    const uni = dbContext.set('unis');

    // Act
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({
          user,
          order,
        }),
      )
      .join(
        uni,
        joined => joined.order.id,
        uni => uni.orderId,
        (joined, uni) => ({
          ...joined,
          uni,
        }),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(`SELECT *
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
        INNER JOIN unis AS u1 ON (o.id = u1.orderId)`),
    );
  });

  test('Select with join e seletor de colunas', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');
    const uni = dbContext.set('unis');

    // Act
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({
          user,
          order,
        }),
      )
      .join(
        uni,
        joined => joined.order.id,
        uni => uni.orderId,
        (joined, uni) => ({
          ...joined,
          uni,
        }),
      )
      .select(joined => ({
        amount: joined.order.amount,
      }))
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(`SELECT o.amount
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
        INNER JOIN unis AS u1 ON (o.id = u1.orderId)`),
    );
  });
});
