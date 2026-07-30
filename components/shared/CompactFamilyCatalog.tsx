"use client";

import type { ProductFamily } from "@/lib/product-families";
import { CompactFamilyRow } from "@/components/shared/CompactFamilyRow";

type CompactFamilyCatalogProps = {
  families: ProductFamily[];
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
  /** Claves de familia que tambien viven en la galeria Top 12 (para el chip discreto). */
  top12Keys?: ReadonlySet<string>;
};

/**
 * Directorio compacto "Encuentra tu perfume" (Fase 2B.10): una fila por
 * familia, sin fotografia. Pensado para 100+ productos internos sin cargar
 * ni renderizar imagenes o fallbacks grandes. Complementa (no reemplaza) al
 * Top 12 visual, que sigue siendo la unica seccion con tarjetas grandes.
 */
export function CompactFamilyCatalog({
  families,
  quantities,
  onAdd,
  onDecrease,
  onRemove,
  top12Keys
}: CompactFamilyCatalogProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {families.map((family) => (
        <CompactFamilyRow
          key={family.key}
          family={family}
          quantities={quantities}
          onAdd={onAdd}
          onDecrease={onDecrease}
          onRemove={onRemove}
          isTop12={top12Keys?.has(family.key) ?? false}
        />
      ))}
    </div>
  );
}
