import type { ProductRecord } from "@/lib/types";

export type CartItemInput = {
  productoId: string;
  cantidad: number;
};

export type CartLine = {
  productoId: string;
  cantidad: number;
  product?: ProductRecord;
  subtotal: number;
};

export function calcularTotalPedido(items: Array<{ subtotal: number }>) {
  return items.reduce((sum, item) => sum + item.subtotal, 0);
}

export function validarCantidad(cantidad: number) {
  return Number.isInteger(cantidad) && cantidad >= 1;
}

export function normalizarProductoParaCarrito(
  items: CartItemInput[],
  products: ProductRecord[]
): CartLine[] {
  return items.map((item) => {
    const product = products.find((current) => current.id === item.productoId);

    return {
      ...item,
      product,
      subtotal: product ? product.precioVenta * item.cantidad : 0
    };
  });
}
