/**
 * Interface para modelo de Usuário
 */
export interface User {
  id: number;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Interface para modelo de Pedido
 */
export interface Order {
  id: number;
  userId: number;
  amount: number;
  status: string;
  createdAt: Date;
}

export interface OrderProduct {
  id: number;
  orderId: number;
  productId: number;
}

/**
 * Interface para modelo de Produto
 */
export interface Product {
  id: number;
  name: string;
  price: number;
  categoryId: number;
}

/**
 * Interface para modelo de Categoria
 */
export interface Category {
  id: number;
  name: string;
  description?: string;
}
