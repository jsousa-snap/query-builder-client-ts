import { DbContext } from '../core/context/DbContext';
import { User, Order, Product } from './common/models';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

describe('Subquery Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;
  let products: DbSet<Product>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
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

    expect(sql).toEqual(``);
  });

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

    expect(sql).toEqual(``);
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

    expect(sql).toContain(``);
  });

  test('Complex subquery with multiple levels', () => {
    const menusDbSet = dbContext.set('SSRB00');
    const abasDbSet = dbContext.set('SSRB01');
    const gruposDbSet = dbContext.set('SSRB02');
    const colecoesDbSet = dbContext.set('SSRB03');
    const itensColecoesDbSet = dbContext.set('SSRB04');
    const tooltipDbSet = dbContext.set('SSRB05');
    const itensBotoesDbSet = dbContext.set('SSRB06');
    const imagensDbSet = dbContext.set('SSDD66');
    const traducoesRibbonDbSet = dbContext.set('SSLP00');
    const traducoesTelasDbSet = dbContext.set('SSLP01');
    const dicionarioDbSet = dbContext.set('SSDD00');
    const agrupamentoCamposDbSet = dbContext.set('SSDD27');
    const telasDbSet = dbContext.set('SSDD29');
    const indicadoresDbSet = dbContext.set('SSRB07');

    const query = menusDbSet
      .join(
        imagensDbSet,
        menu => menu.ukSSDD66,
        imagem => imagem.ukey,
        (menu, imagem) => ({
          menu,
          imagem,
        }),
      )
      .join(
        traducoesRibbonDbSet,
        joined => joined.menu.ukey,
        traducao => traducao.ukSSRB00,
        (joined, traducao) => ({
          ...joined,
          traducao,
        }),
      )
      .where(
        joined =>
          joined.traducao.arLanguage === 0 &&
          joined.menu.ukey === '2976556E-10C0-49DF-B24B-AC3A60E96F05',
      )
      .orderBy(joined => joined.menu.recorder)
      .orderBy(joined => joined.menu.code)
      .select(joined => ({ code: joined.menu.code, imagemCode: joined.imagem.code }));

    const queryString = query.toQueryString();

    console.log(queryString);
  });
});
