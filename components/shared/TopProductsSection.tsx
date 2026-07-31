"use client";

import { Sparkles } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";
import { ProductFamilyCard } from "@/components/shared/ProductFamilyCard";
import { groupProductsIntoFamilies, getTopFamilies } from "@/lib/product-families";

type TopProductsSectionProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
};

/**
 * Ranking 1..12 de familias destacadas (es_top + orden_destacado). Si dos
 * variantes de la MISMA familia estan vinculadas a posiciones distintas del
 * Top 12 (ej. Lady Million 30ML en la posicion 3 y 80ML en la 7), se
 * muestra UNA sola tarjeta publica: la posicion mas alta (numero menor) gana
 * el ranking mostrado, y esa variante queda preseleccionada en el selector
 * de tamano (conservando su imagen Top 12 propia).
 */
export function TopProductsSection({
  products,
  quantities,
  onAdd,
  onDecrease,
  onRemove
}: TopProductsSectionProps) {
  const families = groupProductsIntoFamilies(products);
  const topFamilies = getTopFamilies(families, TOP_PRODUCTS_LIMIT);

  if (topFamilies.length === 0) {
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
      <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {topFamilies.map(({ family, rank, initialVariantId }) => (
          <ProductFamilyCard
            key={family.key}
            family={family}
            rank={rank}
            initialVariantId={initialVariantId}
            imageFit="contain"
            quantities={quantities}
            onAdd={onAdd}
            onDecrease={onDecrease}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}
