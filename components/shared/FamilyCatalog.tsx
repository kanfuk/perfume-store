"use client";

import { PackageOpen } from "lucide-react";
import type { ProductFamily } from "@/lib/product-families";
import { ProductFamilyCard } from "@/components/shared/ProductFamilyCard";

type FamilyCatalogProps = {
  families: ProductFamily[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
  /** Grilla mas densa (2/3/4/5 columnas) usada por el catalogo publico completo. */
  dense?: boolean;
};

/**
 * Grilla publica de familias de perfume: una tarjeta por familia (con
 * selector de tamano cuando hay mas de una variante). Analogo a
 * ProductCatalog, pero a nivel de familia en vez de producto individual.
 * ProductCatalog.tsx se mantiene intacto porque tambien lo usa el selector
 * de productos de venta directa en admin (AdminDirectSale), que debe seguir
 * operando por producto/SKU exacto, no por familia.
 */
export function FamilyCatalog({ families, quantities, onAdd, onDecrease, onRemove, dense = false }: FamilyCatalogProps) {
  if (families.length === 0) {
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
      {families.map((family) => (
        <ProductFamilyCard
          key={family.key}
          family={family}
          quantities={quantities}
          onAdd={onAdd}
          onDecrease={onDecrease}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
