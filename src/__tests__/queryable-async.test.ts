const mockDatabaseProvider: IDatabaseProvider = {
  execAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
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
    const result = await queryable.execAsync();
    expect(result).toEqual([{ id: 1, name: 'Alice' }]);
    expect(mockDatabaseProvider.execAsync).toHaveBeenCalled();
  });
});
