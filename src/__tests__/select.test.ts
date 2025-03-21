import { DbContext } from '../core/context/DbContext';
import { User } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';
import { ExpressionSerializer } from '../utils/ExpressionSerializer';

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

    const metadata = JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2);

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]`);
  });

  test('Select specific columns', () => {
    const query = users.select(u => ({
      userId: u.id,
      nomeLimpo: u.name.trim(),
      nomeComecaLimpo: u.name.trimStart(),
      nomeTerminaLimpo: u.name.trimEnd(),
    }));
    const sql = query.toQueryString();

    const metadata = JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2);

    expect(sql)
      .toEqual(`SELECT [u].[id] AS [userId], LTRIM(RTRIM([u].[name])) AS [nomeLimpo], LTRIM([u].[name]) AS [nomeComecaLimpo], RTRIM([u].[name]) AS [nomeTerminaLimpo]
FROM [users] AS [u]`);
  });
});
