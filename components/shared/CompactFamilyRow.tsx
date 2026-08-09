"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { getAvailableProductStock } from "@/lib/stock";
import { getDefaultVariant, getSelectableVariants, type ProductFamily } from "@/lib/product-families";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";

type CompactFamilyRowProps = {
  family: ProductFamily;
  quantities: Record<string, number>;
  onAdd: (productId: string) => void;
  onDecrease?: (productId: string) => void;
  onRemove?: (productId: string) => void;
  /** Muestra el chip discreto "Top {TOP_PRODUCTS_LIMIT}" (la familia tambien vive en la galeria visual). */
  isTop12?: boolean;
};

/**
 * Fila/tarjeta compacta de UNA familia para el directorio "Encuentra tu
 * perfume" (Fase 2B.10). A proposito NO usa ProductFamilyCard/ProductCard:
 * el directorio completo (100+ productos) no debe cargar ni mostrar
 * fotografias grandes ni fallbacks. Prioriza marca, nombre, variante,
 * precio, disponibilidad y el boton Agregar.
 */
export function CompactFamilyRow({ family, quantities, onAdd, onDecrease, onRemove, isTop12 = false }: CompactFamilyRowProps) {
  const selectableVariants = getSelectableVariants(family);
  const [selectedId, setSelectedId] = useState(() => getDefaultVariant(family).productId);
  const selected = selectableVariants.find((v) => v.productId === selectedId) ?? getDefaultVariant(family);

  const quantity = quantities[selected.productId] ?? 0;
  const availableStock = getAvailableProductStock({ stockActual: selected.stockActual });
  const isOutOfStock = !selected.disponible || availableStock <= 0;
  const selectorId = `compact-size-${family.key}`;
  const hasMultipleVariants = selectableVariants.length > 1;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#DDD0C1] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-[#8C8175]">{family.marca}</p>
          {isTop12 ? (
            <span className="shrink-0 rounded-full bg-[#F4E8DB] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8A6036]">
              Top {TOP_PRODUCTS_LIMIT}
            </span>
          ) : null}
        </div>
        <h4 className="truncate text-sm font-semibold text-[#191714] sm:text-base">{family.nombre}</h4>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:w-52">
        {hasMultipleVariants ? (
          <div className="w-full space-y-1">
            <label htmlFor={selectorId} className="sr-only">
              Elige el tamaño de {family.nombre}
            </label>
            <select
              id={selectorId}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-[#DDD0C1] bg-white px-2.5 py-2 text-sm text-[#191714] outline-none focus:border-[#B88B58] focus:ring-2 focus:ring-[#F4E8DB]"
            >
              {selectableVariants.map((variant) => (
                <option key={variant.productId} value={variant.productId} disabled={!variant.disponible}>
                  {variant.contenido} — {formatCurrency(variant.precioVenta)}
                  {variant.disponible ? "" : " (Sin stock)"}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="w-full text-sm">
            <span className="text-[#8C8175]">{selected.contenido}</span>
            <span className="ml-2 font-semibold text-[#191714]">{formatCurrency(selected.precioVenta)}</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            isOutOfStock ? "bg-[#fdf1ef] text-[#8a2c22]" : "bg-[#eefbf1] text-[#1f6d33]"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isOutOfStock ? "bg-[#b44b43]" : "bg-[#1f9d4b]"}`} />
          {isOutOfStock ? "Sin stock" : "Disponible"}
        </span>

        {quantity > 0 && onDecrease && onRemove ? (
          <div className="flex items-center gap-1 rounded-xl border border-[#DDD0C1] bg-[#F7F1E8] px-1.5 py-1">
            <button
              type="button"
              onClick={() => onDecrease(selected.productId)}
              aria-label={`Quitar una unidad de ${family.nombre}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4D453D] hover:bg-white"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-6 text-center text-sm font-semibold text-[#191714]">{quantity}</span>
            <button
              type="button"
              onClick={() => onAdd(selected.productId)}
              disabled={isOutOfStock || quantity >= availableStock}
              aria-label={`Agregar una unidad de ${family.nombre}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#4D453D] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onAdd(selected.productId)}
            disabled={isOutOfStock}
            className="app-button-primary inline-flex min-h-11 items-center gap-1.5 px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        )}
      </div>
    </div>
  );
}
