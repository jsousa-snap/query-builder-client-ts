import { DbContext } from '../core/context/DbContext';
import { normalizeSQL } from './common/test-utils';
import { DbSet } from '../core/context/DbSet';
import { IDatabaseProvider } from '../core/query/Types';

// Definição dos modelos
interface User {
  id: number;
  name: string;
  email: string;
}

interface Order {
  id: number;
  userId: number;
  date: Date;
  status: string;
}

interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
}

interface Product {
  id: number;
  name: string;
  price: number;
  description: string;
}

// Mock do provedor de banco de dados
const mockDatabaseProvider: IDatabaseProvider = {
  queryAsync: jest.fn().mockResolvedValue([
    {
      userName: 'John Doe',
      productName: 'Laptop',
      quantity: 2,
      total: 2000,
    },
  ]),
  firstAsync: jest.fn().mockResolvedValue({
    userName: 'John Doe',
    productName: 'Laptop',
    quantity: 2,
    total: 2000,
  }),
};

describe('Complex Join Calculations Tests', () => {
  let dbContext: DbContext;
  let users: DbSet<User>;
  let orders: DbSet<Order>;
  let orderItems: DbSet<OrderItem>;
  let products: DbSet<Product>;

  beforeEach(() => {
    // Configurar o contexto e as tabelas antes de cada teste
    dbContext = new DbContext(mockDatabaseProvider);
    users = dbContext.set<User>('users');
    orders = dbContext.set<Order>('orders');
    orderItems = dbContext.set<OrderItem>('order_items');
    products = dbContext.set<Product>('products');

    // Resetar os mocks antes de cada teste
    jest.clearAllMocks();
  });

  test('Multiple joins with calculated total field', () => {
    // Construir a consulta com múltiplos joins e campo calculado
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .join(
        orderItems,
        joined => joined.order.id,
        item => item.orderId,
        (joined, item) => ({ ...joined, item }),
      )
      .join(
        products,
        joined => joined.item.productId,
        product => product.id,
        (joined, product) => ({ ...joined, product }),
      )
      .select(result => ({
        userName: result.user.name,
        productName: result.product.name,
        quantity: result.item.quantity,
        total: result.item.quantity * result.product.price,
      }));

    // Obter o SQL gerado
    const sql = query.toQueryString();

    // Verificar se o SQL gerado contém todas as tabelas e joins esperados
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
SELECT
  u.name AS userName,
  p.name AS productName,
  o1.quantity AS quantity,
  (o1.quantity * p.price) AS total
FROM users AS u
  INNER JOIN orders AS o ON (u.id = o.userId)
  INNER JOIN order_items AS o1 ON (o.id = o1.orderId)
  INNER JOIN products AS p ON (o1.productId = p.id)
      `),
    );

    // Testar a execução da consulta
    return query.toListAsync().then(results => {
      // Verificar se o método queryAsync foi chamado
      expect(mockDatabaseProvider.queryAsync).toHaveBeenCalled();

      // Verificar se os resultados foram processados corretamente
      expect(results).toHaveLength(1);
      expect(results[0].userName).toBe('John Doe');
      expect(results[0].productName).toBe('Laptop');
      expect(results[0].quantity).toBe(2);
      expect(results[0].total).toBe(2000);
    });
  });

  test('Multiple joins with filtering', () => {
    // Construir a consulta com múltiplos joins, campo calculado e filtros
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .join(
        orderItems,
        joined => joined.order.id,
        item => item.orderId,
        (joined, item) => ({ ...joined, item }),
      )
      .join(
        products,
        joined => joined.item.productId,
        product => product.id,
        (joined, product) => ({ ...joined, product }),
      )
      .where(
        result =>
          result.order.status === 'completed' &&
          result.product.price > 100 &&
          result.item.quantity >= 1,
      )
      .select(result => ({
        userName: result.user.name,
        productName: result.product.name,
        quantity: result.item.quantity,
        total: result.item.quantity * result.product.price,
      }));

    // Obter o SQL gerado
    const sql = query.toQueryString();

    // Verificar se o SQL gerado contém a cláusula WHERE esperada
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT
  u.name AS userName,
  p.name AS productName,
  o1.quantity AS quantity,
  (o1.quantity * p.price) AS total
FROM users AS u
  INNER JOIN orders AS o ON (u.id = o.userId)
  INNER JOIN order_items AS o1 ON (o.id = o1.orderId)
  INNER JOIN products AS p ON (o1.productId = p.id)
WHERE
  (((o.status = 'completed') AND
  (p.price > 100)) AND
  (o1.quantity >= 1))`),
    );
  });

  test('Multiple joins with grouping and aggregation (using type assertion)', () => {
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({ user, order }),
      )
      .join(
        orderItems,
        joined => joined.order.id,
        item => item.orderId,
        (joined, item) => ({ ...joined, item }),
      )
      .join(
        products,
        joined => joined.item.productId,
        product => product.id,
        (joined, product) => ({ ...joined, product }),
      )
      .groupBy(result => [result.user.id, result.product.id])
      .select(result => ({
        userId: result.user.id,
        userName: result.user.name,
        productId: result.product.id,
        productName: result.product.name,
        itemQuantity: result.item.quantity,
        productPrice: result.product.price,
      }))
      .sum(g => g.itemQuantity, 'totalQuantity')
      .sum(g => g.itemQuantity * g.productPrice, 'totalAmount')
      .havingSum(
        g => g.itemQuantity,
        sum => sum > 5,
      );

    // Obter o SQL gerado
    const sql = query.toQueryString();

    expect(sql).toContain(
      `SELECT
  u.id AS userId,
  p.id AS productId,
  SUM(o1.quantity) AS totalQuantity,
  SUM(p.price) AS totalAmount
FROM users AS u
  INNER JOIN orders AS o ON (u.id = o.userId)
  INNER JOIN order_items AS o1 ON (o.id = o1.orderId)
  INNER JOIN products AS p ON (o1.productId = p.id)
GROUP BY
  u.id, p.id
HAVING
  (SUM(o1.quantity) > 5)`,
    );
  });
});
