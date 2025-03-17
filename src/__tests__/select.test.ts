import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

describe('Select Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
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
});
