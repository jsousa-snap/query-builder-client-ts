// src/__tests__/subquery-where.test.ts
import { normalizeSQL } from './common/test-utils';
import { DbContext } from '../core/context/DbContext';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

describe('Query Builder - Subquery WHERE Tests', () => {
  let dbContext: DbContext;

  // Define alguns modelos de teste
  interface User {
    id: number;
    name: string;
    email: string;
    salary: number;
    departmentId: number;
  }

  interface Order {
    id: number;
    userId: number;
    status: string;
    amount: number;
  }

  interface Department {
    id: number;
    name: string;
    managerId: number;
  }

  beforeEach(() => {
    // Cria um contexto novo para cada teste
    dbContext = new DbContext(mockDatabaseProvider);
  });

  test('WHERE IN com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');

    // Act
    const query = users
      .whereIn(
        u => u.id,
        orders.where(o => o.status === 'completed').select(o => ({ userId: o.userId })),
      )
      .select(u => u.name)
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(`SELECT
  *
FROM users AS u
WHERE
  u.id IN ((
SELECT
  o.userId AS userId
FROM orders AS o
WHERE
  (o.status = 'completed')))`),
    );
  });

  test('WHERE NOT IN com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');

    // Act
    const query = users
      .whereNotIn(
        u => u.id,
        orders.where(o => o.status === 'canceled').select(o => ({ userId: o.userId })),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(
        "WHERE u.id NOT IN (SELECT o.userId FROM orders AS o WHERE (o.status = 'canceled'))",
      ),
    );
  });

  test('WHERE EXISTS com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');

    // Act
    const query = users
      .whereExists(orders.where(o => o.status === 'completed').select(_ => 1))
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(`SELECT
  *
FROM users AS u
WHERE
  EXISTS ((
SELECT
  1 AS value
FROM orders AS o
WHERE
  (o.status = 'completed')))`),
    );
  });

  test('WHERE NOT EXISTS com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');

    // Act
    const query = users
      .whereNotExists(orders.where(o => o.status === 'canceled').select(_ => 1))
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL("WHERE NOT EXISTS (SELECT 1 FROM orders AS o WHERE (o.status = 'canceled'))"),
    );
  });

  test('WHERE = com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const departments = dbContext.set<Department>('departments');

    // Act - Adicionando limit(1) na subconsulta
    const query = users
      .whereEqual(
        u => u.id,
        departments
          .where(d => d.name === 'IT')
          .select(d => d.managerId)
          .limit(1),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(
        "WHERE (u.id = (SELECT TOP 1 d.managerId FROM departments AS d WHERE (d.name = 'IT')))",
      ),
    );
  });

  test('WHERE > com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');

    // Act - Adicionando limit(1) na subconsulta
    const query = users
      .whereGreaterThan(
        u => u.salary,
        users
          .select(u => ({ avg_salary: u.salary }))
          .avg(u => u.avg_salary)
          .limit(1),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL('WHERE (u.salary > (SELECT TOP 1 AVG(u.salary) AS avg FROM users AS u))'),
    );
  });

  test('WHERE >= com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const departments = dbContext.set<Department>('departments');

    // Act - Adicionando limit(1) na subconsulta
    const query = users
      .whereGreaterThanOrEqual(
        u => u.salary,
        departments.select(d => ({ min_salary: 50000 })).limit(1),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL('WHERE (u.salary >= (SELECT TOP 1 50000 AS min_salary FROM departments AS d))'),
    );
  });

  test('WHERE < com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const departments = dbContext.set<Department>('departments');

    // Act - Adicionando limit(1) na subconsulta
    const query = users
      .whereLessThan(u => u.salary, departments.select(d => ({ max_salary: 100000 })).limit(1))
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL('WHERE (u.salary < (SELECT TOP 1 100000 AS max_salary FROM departments AS d))'),
    );
  });

  test('WHERE <= com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const departments = dbContext.set<Department>('departments');

    // Act - Adicionando limit(1) na subconsulta
    const query = users
      .whereLessThanOrEqual(
        u => u.salary,
        departments.select(d => ({ avg_salary: 75000 })).limit(1),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL('WHERE (u.salary <= (SELECT TOP 1 75000 AS avg_salary FROM departments AS d))'),
    );
  });

  test('WHERE != com subconsulta', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const departments = dbContext.set<Department>('departments');

    // Act - Adicionando limit(1) na subconsulta
    const query = users
      .whereNotEqual(
        u => u.departmentId,
        departments
          .where(d => d.name === 'HR')
          .select(d => d.id)
          .limit(1),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(
        "WHERE (u.departmentId != (SELECT TOP 1 d.id FROM departments AS d WHERE (d.name = 'HR')))",
      ),
    );
  });

  test('Consulta complexa com múltiplas subconsultas', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');
    const departments = dbContext.set<Department>('departments');

    // Act
    const query = users
      .where(u => u.name.includes('John'))
      .whereIn(
        u => u.id,
        orders.where(o => o.amount > 1000).select(o => o.userId),
      )
      .whereNotExists(orders.where(o => o.status === 'canceled').select(_ => 1))
      .whereEqual(
        u => u.departmentId,
        departments
          .where(d => d.name === 'Sales')
          .select(d => d.id)
          .limit(1),
      )
      .toQueryString();

    // Assert
    expect(normalizeSQL(query)).toContain(
      normalizeSQL(`SELECT *
FROM users AS u
WHERE (((LIKE(u.name, CONCAT('%', 'John', '%'))
         AND u.id IN (
                        (SELECT o.userId AS value
                         FROM orders AS o
                         WHERE (o.amount > 1000))))
        AND NOT EXISTS (
                          (SELECT 1 AS value
                           FROM orders AS o
                           WHERE (o.status = 'canceled'))))
       AND (u.departmentId =
              (SELECT TOP 1 d.id AS value
               FROM departments AS d
               WHERE (d.name = 'Sales'))))`),
    );
  });
});
