"use client";

import { Sparkles } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";
import { ProductCard } from "@/components/shared/ProductCard";

type TopProductsSectionProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
};

/** Ranking 1..12 de productos destacados (es_top + orden_destacado). */
export function TopProductsSection({
  products,
  quantities,
  onAdd,
  onDecrease,
  onRemove
}: TopProductsSectionProps) {
  const topProducts = products
    .filter((product) => product.esTop && typeof product.ordenDestacado === "number")
    .sort((a, b) => (a.ordenDestacado ?? 0) - (b.ordenDestacado ?? 0))
    .slice(0, TOP_PRODUCTS_LIMIT);

  if (topProducts.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#d0d5dd] bg-white px-5 py-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eeebff] text-[#7357ff]">
          <Sparkles className="h-5 w-5" />
        </span>
        <h4 className="text-base font-semibold text-[#111318]">
          El Top 12 se publicará muy pronto
        </h4>
        <p className="max-w-md text-sm leading-6 text-[#667085]">
          Estamos confirmando los 12 perfumes más vendidos de Smellme.cl.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eeebff] text-[#7357ff]">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#111318]">Top 12</h3>
          <p className="text-sm text-[#667085]">Los perfumes más pedidos de Smellme.cl.</p>
        </div>
      </div>
      <div className="grid w-full max-w-full min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            rank={product.ordenDestacado}
            imageFit="contain"
            quantity={quantities[product.id] ?? 0}
            onAdd={() => onAdd(product.id)}
            onDecrease={onDecrease ? () => onDecrease(product.id) : undefined}
            onRemove={onRemove ? () => onRemove(product.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
