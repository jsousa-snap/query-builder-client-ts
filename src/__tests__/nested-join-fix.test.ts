// src/__tests__/nested-property-tracking.test.ts

import { DbContext } from '../core/context/DbContext';
import { JoinType } from '../core/expressions/JoinExpression';
import { OrderDirection } from '../core/query/Types';

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

/**
 * Testes específicos para o rastreamento de propriedades aninhadas
 * Estes testes ajudam a garantir que o rastreamento de propriedades
 * funcione corretamente para referências aninhadas em operações de join
 */
describe('Rastreamento de Propriedades Aninhadas', () => {
  let dbContext: DbContext;

  // Definir modelos para os testes
  interface User {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
  }

  interface Order {
    id: number;
    userId: number;
    amount: number;
    status: string;
    createdAt: Date;
  }

  interface OrderItem {
    id: number;
    orderId: number;
    productId: number;
    quantity: number;
    price: number;
  }

  beforeEach(() => {
    // Criar contexto limpo para cada teste
    dbContext = new DbContext();
  });

  test('subquery', () => {
    const db = new DbContext();
    const users = db.set('users');
    const posts = db.set('posts');
    const comments = db.set('comments');

    // Exemplo 1: Consulta simples com subconsulta para contagem de posts
    const usersWithPostCount = users
      .select(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        qualquerCoisa: '',
      }))
      .withSubquery(
        'postCount',
        posts,
        user => user.qualquerCoisa,
        post => post.userId,
        query => query.where(x => x.jjj === 'jander').count(),
      );

    console.log('SQL gerado:');
    console.log(usersWithPostCount.toQueryString());
  });
  test('subquery', () => {
    const db = new DbContext();
    const users = db.set('users');
    const posts = db.set('posts');
    const comments = db.set('comments');

    const query = users
      .join(
        posts,
        user => user.id,
        post => post.userId,
        (user, post) => ({ user, post }),
      )
      .withSubquery(
        'commentCount',
        comments,
        joined => joined.post.id,
        comment => comment.postId,
        query => query.count(),
      )
      .select(joined => ({
        userName: joined.user.name,
        postTitle: joined.post.title,
      }));

    const sql = query.toQueryString();
    console.log(sql);
  });

  test('Deve rastrear propriedades em objetos aninhados após join', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');

    // Act
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({
          user, // Objeto completo
          order, // Objeto completo
        }),
      )
      .select(joined => ({
        userName: joined.user.name, // Propriedade aninhada no objeto user
        orderAmount: joined.order.amount, // Propriedade aninhada no objeto order
      }));

    const sql = query.toQueryString();

    // Assert
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT
            u.name AS userName,
            o.amount AS orderAmount
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
    `),
    );
  });

  test('Deve rastrear propriedades em joins aninhados', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');
    const orderItems = dbContext.set<OrderItem>('order_items');

    // Act
    const query = users
      .join(
        orders,
        user => user.id,
        order => order.userId,
        (user, order) => ({
          user, // Objeto completo
          order, // Objeto completo
        }),
      )
      .join(
        orderItems,
        joined => joined.order.id, // Referência aninhada como chave de join
        item => item.orderId,
        (joined, item) => ({
          user: joined.user,
          order: joined.order,
          item,
        }),
      )
      .select(result => ({
        customerName: result.user.name,
        orderDate: result.order.createdAt,
        totalAmount: result.order.amount,
        productId: result.item.productId,
        quantity: result.item.quantity,
      }));

    const sql = query.toQueryString();

    // Assert
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT
            u.name AS customerName,
            o.createdAt AS orderDate,
            o.amount AS totalAmount,
            o1.productId AS productId,
            o1.quantity AS quantity
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
        INNER JOIN order_items AS o1 ON (o.id = o1.orderId)
        `),
    );
  });

  test('Deve rastrear propriedades em where após join aninhado', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');

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
      .where(joined => joined.order.amount > 100 && joined.user.name.includes('John'));

    const sql = query.toQueryString();

    // Assert
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT
            *
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
        WHERE
        ((u.amount > 100) AND
        LIKE(u.name, CONCAT('%', 'John', '%')))`),
    );
  });

  test('Deve rastrear propriedades em orderBy após join aninhado', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');

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
      .orderBy(joined => joined.order.amount, OrderDirection.DESC)
      .orderBy(joined => joined.user.name);

    const sql = query.toQueryString();

    // Assert
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT
            *
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
        ORDER BY
        o.amount DESC, u.name ASC
  `),
    );
  });

  test('Deve rastrear corretamente com múltiplos joins e ambiguidade de nomes de colunas', () => {
    // Arrange - Criar tabelas com colunas de mesmo nome
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');
    const orderItems = dbContext.set<OrderItem>('order_items');

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
        orderItems,
        joined => joined.order.id,
        item => item.orderId,
        (joined, item) => ({
          user: joined.user,
          order: joined.order,
          item,
        }),
      )
      .select(result => ({
        // Colunas "id" existem em todas as tabelas!
        userId: result.user.id,
        orderId: result.order.id,
        itemId: result.item.id,
      }));

    const sql = query.toQueryString();

    // Assert - cada 'id' deve vir da tabela correta
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT
            u.id AS userId,
            o.id AS orderId,
            o1.id AS itemId
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
        INNER JOIN order_items AS o1 ON (o.id = o1.orderId)`),
    );
  });

  // Este teste reproduz o caso do bug original
  test('Caso específico: junção aninhada com duas tabelas', () => {
    // Arrange
    const users = dbContext.set<User>('users');
    const orders = dbContext.set<Order>('orders');
    const unis = dbContext.set('unis');

    // Act - Exatamente o caso que falhou antes
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
        unis,
        joined => joined.order.id,
        uni => uni.orderId,
        (joined, uni) => ({
          ...joined,
          uni,
        }),
      )
      .select(joined => ({
        amount: joined.order.amount,
      }));

    const sql = query.toQueryString();

    // Assert - verificar se o SQL contém a referência correta
    expect(normalizeSQL(sql)).toContain(
      normalizeSQL(`
        SELECT
            o.amount AS amount
        FROM users AS u
        INNER JOIN orders AS o ON (u.id = o.userId)
        INNER JOIN unis AS u1 ON (o.id = u1.orderId)
        `),
    );
    expect(sql).not.toContain('u.amount AS amount');
  });
});
