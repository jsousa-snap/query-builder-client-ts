import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { User, Order, Product, OrderProduct } from './common/models';
import { JoinType } from '../core/expressions/JoinExpression';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([{ id: 1, name: 'Alice' }]),
  firstAsync: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }),
};

describe('Join Queries', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;
  let products: DbSet<Product>;
  let orderProducts: DbSet<OrderProduct>;

  beforeEach(() => {
    dbContext = new DbContext(mockDatabaseProvider);
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
    products = dbContext.set<Product>('products');
    orderProducts = dbContext.set<OrderProduct>('orderProducts');
  });

  test('Simple inner join', () => {
    const query = users.join(
      orders,
      user => user.id,
      order => order.userId,
      (user, order) => ({ user, order }),
    );
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
  INNER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])`);
  });

  test('Join with column selection', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .select(joined => ({
        userName: joined.user.name,
        orderAmount: joined.order.amount,
      }));
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT
  [u].[name] AS [userName], [o].[amount] AS [orderAmount]
FROM [users] AS [u]
  INNER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])`);
  });

  test('Multiple joins', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .join(
        orderProducts,
        joined => joined.order.id,
        orderProduct => orderProduct.orderId,
        (joined, orderProduct) => ({
          ...joined,
          orderProduct,
        }),
      )
      .join(
        products,
        joined => joined.orderProduct.productId,
        product => product.id,
        (joined, product) => ({
          ...joined,
          product,
        }),
      );
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
  INNER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])
  INNER JOIN [orderProducts] AS [o1] ON ([o].[id] = [o1].[orderId])
  INNER JOIN [products] AS [p] ON ([o1].[productId] = [p].[id])`);
  });

  test('Left join', () => {
    const query = users.join(
      orders,
      user => user.id,
      order => order.userId,
      (user, order) => ({ user, order }),
      JoinType.LEFT,
    );
    const sql = query.toQueryString();

    expect(sql).toEqual(`SELECT *
FROM [users] AS [u]
  LEFT OUTER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])`);
  });

  test('Join with nested property access', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({
          userDetails: {
            id: user.id,
            name: user.name,
          },
          orderInfo: {
            id: order.id,
            amount: order.amount,
          },
        }),
      )
      .select(joined => ({
        userId: joined.userDetails.id,
        userName: joined.userDetails.name,
        orderAmount: joined.orderInfo.amount,
      }));
    const sql = query.toQueryString();

    expect(sql).toContain(`SELECT
  [u].[id] AS [userId], [u].[name] AS [userName], [o].[amount] AS [orderAmount]
FROM [users] AS [u]
  INNER JOIN [orders] AS [o] ON ([u].[id] = [o].[userId])`);
  });
});
