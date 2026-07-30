"use client";

import { PackageOpen } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { ProductCard } from "@/components/shared/ProductCard";

type ProductCatalogProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
  showStockCount?: boolean;
  footerLabel?: string;
  /** Grilla mas densa (2/3/4/5 columnas) usada por el catalogo publico completo. */
  dense?: boolean;
};

export function ProductCatalog({
  products,
  quantities,
  onAdd,
  onDecrease,
  onRemove,
  showStockCount = false,
  footerLabel,
  dense = false
}: ProductCatalogProps) {
  if (products.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center border-y border-dashed border-[#d0d5dd] px-5 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eeebff] text-[#7357ff]">
          <PackageOpen className="h-6 w-6" />
        </span>
        <h4 className="mt-4 text-lg font-semibold text-[#111318]">
          El catálogo estará disponible muy pronto
        </h4>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#667085]">
          Estamos preparando Top 12, ofertas y el catálogo completo de Smellme.cl.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid w-full max-w-full min-w-0 gap-3 auto-rows-fr sm:gap-4 ${
        dense ? "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]" : "md:grid-cols-2"
      }`}
    >
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          quantity={quantities[product.id] ?? 0}
          onAdd={() => onAdd(product.id)}
          onDecrease={onDecrease ? () => onDecrease(product.id) : undefined}
          onRemove={onRemove ? () => onRemove(product.id) : undefined}
          showStockCount={showStockCount}
          footerLabel={footerLabel}
        />
      ))}
    </div>
  );
}
