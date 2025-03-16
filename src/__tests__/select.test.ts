import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User } from './common/models';
import { DbSet } from '../core/context/DbSet';

describe('Select Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;

  beforeEach(() => {
    dbContext = new DbContext();
    users = dbContext.set<User>('users');
  });

  test('Select all columns', () => {
    const query = users.query();
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(normalizeSQL('SELECT * FROM users AS u'));
  });

  test('Select specific columns', () => {
    const query = users.select(u => ({
      userId: u.id,
      userName: u.name,
    }));
    const sql = query.toQueryString();

    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT u.id AS userId, u.name AS userName FROM users AS u'),
    );
  });

  test('Select with complex object mapping', () => {
    const query = users.select(u => ({
      fullUser: {
        id: u.id,
        name: u.name,
        active: u.isActive,
      },
    }));
    const sql = query.toQueryString();

    // O teste aqui pode precisar ser ajustado dependendo de como a serialização de objetos complexos é tratada
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL('SELECT u.id, u.name, u.isActive FROM users AS u'),
    );
  });

  test('Select with nested property access', () => {
    // Este teste pode precisar de um cenário de join ou objeto aninhado
    const query = users.select(u => ({
      userId: u.id,
      userDetails: {
        name: u.name,
        age: u.age,
      },
    }));
    const sql = query.toQueryString();

    // O teste exato dependerá da implementação de propriedades aninhadas
    expect(normalizeSQL(sql)).toContain(normalizeSQL('SELECT u.id, u.name, u.age FROM users AS u'));
  });
});
