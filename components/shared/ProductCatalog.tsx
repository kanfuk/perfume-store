"use client";

import type { ProductRecord } from "@/lib/types";
import { ProductCard } from "@/components/shared/ProductCard";

type ProductCatalogProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  showStockCount?: boolean;
  footerLabel?: string;
};

export function ProductCatalog({
  products,
  quantities,
  onAdd,
  showStockCount = false,
  footerLabel
}: ProductCatalogProps) {
  return (
    <div className="grid w-full max-w-full min-w-0 gap-4 md:auto-rows-fr md:grid-cols-2">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          quantity={quantities[product.id] ?? 0}
          onAdd={() => onAdd(product.id)}
          showStockCount={showStockCount}
          footerLabel={footerLabel}
        />
      ))}
    </div>
  );
}
