"use client";

import type { ProductRecord } from "@/lib/types";
import { ProductCard } from "@/components/shared/ProductCard";

type ProductCatalogProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
};

export function ProductCatalog({
  products,
  quantities,
  onAdd
}: ProductCatalogProps) {
  return (
    <div className="grid w-full max-w-full min-w-0 gap-4 md:grid-cols-2">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          quantity={quantities[product.id] ?? 0}
          onAdd={() => onAdd(product.id)}
        />
      ))}
    </div>
  );
}
