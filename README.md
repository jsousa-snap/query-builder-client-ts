# TypeScript Query Builder

Um builder de consultas SQL leve e expressivo com análise de AST para gerar consultas SQL a partir de expressões lambda em TypeScript/JavaScript.

## 📋 Características

- 🔍 **API fluente e expressiva** - sintaxe intuitiva similar ao LINQ
- 🧩 **Fortemente tipada** - suporte completo a TypeScript com inferência de tipos
- 🔄 **Joins inteligentes** - rastreamento automático de tabelas e colunas
- 📊 **Suporte completo a agregações** - funções `count`, `sum`, `avg`, `min`, `max`
- 🧮 **Cláusulas HAVING especializadas** para agregações
- 🔢 **Operações de ordenação** para agregações
- 📝 **Geração de SQL formatado** para fácil leitura
- 📊 **Subconsultas correlacionadas** com tipagem forte

## 📥 Instalação

Como este é um repositório privado, a instalação deve ser feita diretamente a partir do repositório:

```bash
# Usando npm
npm install git+https://[url-do-seu-repositorio-git].git

# Ou adicionando ao package.json
"dependencies": {
  "query-builder-client-ts": "git+https://[url-do-seu-repositorio-git].git"
}
```

## 🔰 Uso Básico

### Em TypeScript

```typescript
import { DbContext, OrderDirection } from 'query-builder-client-ts';

// Defina suas interfaces
interface User {
  id: number;
  name: string;
  email: string;
  age: number;
}

interface Order {
  id: number;
  userId: number;
  amount: number;
  date: Date;
}

// Crie um contexto de banco de dados
const db = new DbContext(/* seu provider de banco de dados */);

// Obtenha referências às tabelas
const users = db.set<User>('users');
const orders = db.set<Order>('orders');

// Construa uma consulta
const query = users
  .where(u => u.age >= 18)
  .select(u => ({
    id: u.id,
    name: u.name,
  }))
  .orderBy(u => u.name)
  .limit(10);

// Obtenha o SQL gerado
const sql = query.toQueryString();
console.log(sql);

// Execute a consulta
const results = await query.toListAsync();
```

### Em JavaScript

```javascript
const { DbContext, OrderDirection } = require('query-builder-client-ts');

// Crie um contexto de banco de dados
const db = new DbContext(/* seu provider de banco de dados */);

// Obtenha referências às tabelas
const users = db.set('users');
const orders = db.set('orders');

// Construa uma consulta
const query = users
  .where(u => u.age >= 18)
  .select(u => ({
    id: u.id,
    name: u.name,
  }))
  .orderBy(u => u.name)
  .limit(10);

// Obtenha o SQL gerado
const sql = query.toQueryString();
console.log(sql);

// Execute a consulta
query
  .toListAsync()
  .then(results => console.log(results))
  .catch(err => console.error(err));
```

## 📚 Exemplos Avançados

### Joins

```typescript
// TypeScript
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
  .select(joined => ({
    userName: joined.user.name,
    orderAmount: joined.order.amount,
  }))
  .where(joined => joined.order.amount > 100);
```

```javascript
// JavaScript
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
  .select(joined => ({
    userName: joined.user.name,
    orderAmount: joined.order.amount,
  }))
  .where(joined => joined.order.amount > 100);
```

### Agregações e Agrupamentos

```typescript
// TypeScript
const query = orders
  .groupBy(o => [o.userId])
  .select(g => ({
    userId: g.userId,
  }))
  .count()
  .sum(g => g.amount, 'totalAmount')
  .avg(g => g.amount, 'averageAmount')
  .havingCount(count => count > 5)
  .havingAvg(
    g => g.amount,
    avg => avg > 100,
  )
  .orderByCount(OrderDirection.DESC);
```

```javascript
// JavaScript
const query = orders
  .groupBy(o => [o.userId])
  .select(g => ({
    userId: g.userId,
  }))
  .count()
  .sum(g => g.amount, 'totalAmount')
  .avg(g => g.amount, 'averageAmount')
  .havingCount(count => count > 5)
  .havingAvg(
    g => g.amount,
    avg => avg > 100,
  )
  .orderByCount(OrderDirection.DESC);
```

### Subqueries (Subconsultas)

```typescript
// TypeScript
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
```

```javascript
// JavaScript
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
```

#### Subconsultas com Agregações

```typescript
// TypeScript
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
```

#### Subconsultas Complexas

```typescript
// TypeScript
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
```

O método `withSubquery` aceita 5 parâmetros:

1. Nome da propriedade no resultado final
2. O DbSet fonte para a subconsulta
3. Seletor para a coluna da consulta principal
4. Seletor para a coluna da subconsulta (para correlação)
5. Função que modifica a subconsulta

### Multiple Joins com Rastreamento de Propriedades

```typescript
// TypeScript
interface Product {
  id: number;
  name: string;
  price: number;
}

interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
}

const products = db.set<Product>('products');
const orderItems = db.set<OrderItem>('order_items');

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
```

```javascript
// JavaScript
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
```

## 🔧 Métodos Principais

### DbContext

- `set<T>(tableName: string)`: Cria um DbSet para uma tabela específica

### DbSet<T>

- `query()`: Inicia uma nova consulta
- `where()`: Filtra registros
- `select()`: Projeta colunas
- `join()`: Realiza junções entre tabelas
- `groupBy()`: Agrupa registros
- `orderBy()`: Ordena resultados
- `limit()`: Limita o número de resultados
- `offset()`: Pula um número de registros
- `withSubquery()`: Adiciona uma subconsulta correlacionada

### Métodos de Agregação

- `count()`: Conta registros
- `sum()`: Soma valores de uma coluna
- `avg()`: Calcula a média de valores
- `min()`: Encontra o valor mínimo
- `max()`: Encontra o valor máximo

### Métodos HAVING

- `having()`: Cláusula HAVING genérica
- `havingCount()`: Filtra por contagem
- `havingSum()`: Filtra por soma
- `havingAvg()`: Filtra por média
- `havingMin()`: Filtra por valor mínimo
- `havingMax()`: Filtra por valor máximo

### Métodos ORDER BY com Agregações

- `orderByCount()`: Ordena por contagem
- `orderBySum()`: Ordena por soma
- `orderByAvg()`: Ordena por média
- `orderByMin()`: Ordena por valor mínimo
- `orderByMax()`: Ordena por valor máximo

## 📄 Uso Interno

Este é um repositório privado destinado apenas para uso interno. Não distribua o código sem autorização.

## 📞 Suporte

Para questões relacionadas a este projeto, entre em contato com a equipe de desenvolvimento.
