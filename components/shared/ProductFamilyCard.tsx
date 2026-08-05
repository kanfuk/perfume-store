"use client";

import { useState } from "react";
import { ProductCard } from "@/components/shared/ProductCard";
import { formatCurrency } from "@/lib/format";
import { getDefaultVariant, getSelectableVariants, type ProductFamily } from "@/lib/product-families";
import type { ProductRecord } from "@/lib/types";

type ProductFamilyCardProps = {
  family: ProductFamily;
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
  imageFit?: "cover" | "contain";
  /** Numero de posicion a mostrar como insignia (Top 12). */
  rank?: number;
  /**
   * Variante inicial a preseleccionar (ej. la vinculada a una posicion del
   * Top 12), en vez de la disponible de menor contenido. Si no existe en la
   * familia o no se provee, se usa `getDefaultVariant`.
   */
  initialVariantId?: string;
};

/**
 * Tarjeta publica de UNA familia de perfume (misma marca+nombre, distinto
 * contenido). Muestra una sola imagen y un selector "Elige el tamaño" que
 * cambia cual variante (producto real e independiente) se agrega al
 * carrito. Nunca fusiona datos: cada opcion del selector sigue apuntando a
 * su propio productId/SKU/precio/stock.
 */
export function ProductFamilyCard({
  family,
  quantities,
  onAdd,
  onDecrease,
  onRemove,
  imageFit = "cover",
  rank,
  initialVariantId
}: ProductFamilyCardProps) {
  const selectableVariants = getSelectableVariants(family);
  const [selectedId, setSelectedId] = useState(() => {
    if (initialVariantId && selectableVariants.some((v) => v.productId === initialVariantId)) {
      return initialVariantId;
    }
    return getDefaultVariant(family).productId;
  });
  const selected =
    selectableVariants.find((v) => v.productId === selectedId) ?? getDefaultVariant(family);

  const virtualProduct: ProductRecord = {
    id: selected.productId,
    sku: selected.sku,
    nombre: family.nombre,
    marca: family.marca,
    contenido: selected.contenido,
    descripcion: family.descripcion,
    precioVenta: selected.precioVenta,
    precioAnterior: selected.precioAnterior,
    imageUrl: selected.imageUrl || family.imageUrl,
    badgeLabel: family.badgeLabel,
    stockActual: selected.stockActual,
    stockReservado: selected.stockReservado,
    activo: selected.activo,
    esTop: selected.esTop,
    esOfertaSemana: selected.esOfertaSemana,
    ordenDestacado: selected.ordenDestacado
  };

  const selectorId = `family-size-${family.key}`;
  const hasMultipleVariants = selectableVariants.length > 1;

  const sizeSelector = hasMultipleVariants ? (
    <div className="space-y-1" onClick={(event) => event.stopPropagation()}>
      <label htmlFor={selectorId} className="truncate text-xs font-semibold text-[#98a2b3]">
        Tamaño
      </label>
      <select
        id={selectorId}
        aria-label={`Elige el tamaño de ${family.nombre}`}
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-[#e4e7ec] bg-white px-2.5 py-2 text-sm text-[#111318] outline-none focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff] sm:px-3"
      >
        {selectableVariants.map((variant) => (
          <option key={variant.productId} value={variant.productId} disabled={!variant.disponible}>
            {variant.contenido} — {formatCurrency(variant.precioVenta)}
            {variant.disponible ? "" : " (Sin stock)"}
          </option>
        ))}
      </select>
      <p aria-live="polite" className="sr-only">
        {selected.disponible
          ? `${selected.contenido}, ${formatCurrency(selected.precioVenta)}, disponible.`
          : `${selected.contenido}, sin stock.`}
      </p>
    </div>
  ) : null;

  return (
    <ProductCard
      product={virtualProduct}
      quantity={quantities[selected.productId] ?? 0}
      onAdd={() => onAdd(selected.productId)}
      onDecrease={onDecrease ? () => onDecrease(selected.productId) : undefined}
      onRemove={onRemove ? () => onRemove(selected.productId) : undefined}
      imageFit={imageFit}
      rank={rank}
      sizeSelector={sizeSelector}
    />
  );
}
