import type { ProductoProps } from "@/domain/Producto";

type ProductStockLike = Pick<ProductoProps, "stockActual" | "stockAgenda">;

export function getAvailableProductStock(product: ProductStockLike) {
  const source =
    typeof product.stockAgenda === "number" ? product.stockAgenda : product.stockActual ?? 0;

  return Math.max(0, source);
}

export function hasEnoughAvailableStock(product: ProductStockLike, quantity: number) {
  return quantity <= getAvailableProductStock(product);
}
