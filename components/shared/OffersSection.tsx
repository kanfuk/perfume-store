"use client";

import { Tag } from "lucide-react";
import type { ProductRecord } from "@/lib/types";
import { ProductCard } from "@/components/shared/ProductCard";

type OffersSectionProps = {
  products: ProductRecord[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
};

/**
 * Ofertas de la semana: solo productos marcados es_oferta_semana. El precio
 * anterior tachado solo se muestra cuando el producto realmente lo trae
 * (nunca se calcula ni se inventa un descuento).
 */
export function OffersSection({ products, quantities, onAdd, onDecrease, onRemove }: OffersSectionProps) {
  const offers = products.filter((product) => product.esOfertaSemana);

  if (offers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff1e6] text-[#b8590f]">
          <Tag className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[#191714]">Ofertas de la semana</h3>
          <p className="text-sm text-[#6B6258]">Precios especiales por tiempo limitado.</p>
        </div>
      </div>
      <div className="grid w-full max-w-full min-w-0 gap-4 md:auto-rows-fr md:grid-cols-2">
        {offers.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
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
