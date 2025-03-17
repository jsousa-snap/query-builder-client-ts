const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

import { Queryable } from '../core/query/Queryable';
// Uso do mock no teste
// Exemplo com o Queryable:
import { IDatabaseProvider } from '../core/query/Types';

describe('Teste com mock de IDatabaseProvider', () => {
  let queryable: Queryable<any>;

  beforeEach(() => {
    queryable = new Queryable(mockDatabaseProvider, 'users', 'u');
  });

  test('toListAsync deve retornar registros', async () => {
    const result = await queryable.toListAsync();
    expect(result).toEqual([{ id: 1, name: 'Alice' }]);
    expect(mockDatabaseProvider.queryAsync).toHaveBeenCalled();
  });

  test('firstAsync deve retornar o primeiro registro', async () => {
    const result = await queryable.firstAsync();
    expect(result).toEqual({ id: 1, name: 'Alice' });
    expect(mockDatabaseProvider.firstAsync).toHaveBeenCalled();
  });
});
