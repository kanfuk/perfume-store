import type { ProductoProps } from "@/domain/Producto";

type ProductStockLike = Pick<ProductoProps, "stockActual" | "stockAgenda">;
type ProductStockRuleLike = Pick<ProductoProps, "stockActual" | "stockAgenda">;

export function getUnifiedProductStock(product: ProductStockLike) {
  const source =
    typeof product.stockActual === "number"
      ? product.stockActual
      : typeof product.stockAgenda === "number"
        ? product.stockAgenda
        : 0;

  return Math.max(0, source);
}

export function getAvailableProductStock(product: ProductStockLike) {
  return getUnifiedProductStock(product);
}

export function hasControlledStock(product: ProductStockRuleLike) {
  return getUnifiedProductStock(product) > 0;
}

export function shouldDecreaseStock(product: ProductStockRuleLike) {
  return hasControlledStock(product);
}

export function canSellWithoutBreakingStock(product: ProductStockRuleLike, quantity: number) {
  if (!shouldDecreaseStock(product)) {
    return true;
  }

  return quantity <= getAvailableProductStock(product);
}

export function normalizeStockValue(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0;
  }

  return Math.floor(numberValue);
}

export function hasEnoughAvailableStock(product: ProductStockLike, quantity: number) {
  return quantity <= getAvailableProductStock(product);
}
