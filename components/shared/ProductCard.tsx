"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { formatCurrency } from "@/lib/format";
import { getAvailableProductStock } from "@/lib/stock";
import type { ProductRecord } from "@/lib/types";

type ProductCardProps = {
  product: ProductRecord;
  quantity?: number;
  onAdd: () => void;
  onDecrease?: () => void;
  onRemove?: () => void;
  actionLabel?: string;
  footerLabel?: string;
  showStockCount?: boolean;
  /** "contain" muestra la imagen completa sin recortar (usado en el Top 12). */
  imageFit?: "cover" | "contain";
  /** Numero de posicion a mostrar como insignia (Top 12). */
  rank?: number;
};

export function ProductCard({
  product,
  quantity = 0,
  onAdd,
  onDecrease,
  onRemove,
  actionLabel,
  footerLabel = "Disponibilidad",
  showStockCount = false,
  imageFit = "cover",
  rank
}: ProductCardProps) {
  const availableStock = getAvailableProductStock(product);
  const isOutOfStock = availableStock <= 0;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const hasLongDescription = (product.descripcion?.trim().length ?? 0) > 96;
  const hasPreviousPrice =
    typeof product.precioAnterior === "number" && product.precioAnterior > product.precioVenta;

  return (
    <article className="interactive-card flex h-full max-w-full touch-manipulation flex-col overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white shadow-sm">
      <div
        className={`relative min-w-0 ${
          imageFit === "contain" ? "aspect-[3/4] bg-white" : "aspect-[4/3] bg-[#f7f8fa]"
        }`}
      >
        <ProductImage
          src={product.imageUrl}
          alt={product.nombre}
          brand={product.marca}
          sizes="(max-width: 768px) calc(100vw - 3rem), 50vw"
          className={imageFit === "contain" ? "object-contain" : "object-cover"}
        />
        {imageFit !== "contain" ? (
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 via-black/25 to-transparent" />
        ) : null}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            {typeof rank === "number" ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7357ff] text-sm font-bold text-white shadow-sm">
                {rank}
              </span>
            ) : null}
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide shadow-sm backdrop-blur-md ${
                imageFit === "contain"
                  ? "border-[#e4e7ec] bg-white/90 text-[#111318]"
                  : "border-white/15 bg-[#111318]/82 text-white"
              }`}
            >
              {product.badgeLabel || product.tipoProducto || "PERFUME"}
            </span>
          </div>
          {quantity > 0 ? (
            <span className="cart-badge-pop rounded-full border border-white/70 bg-white/95 px-3 py-1 text-xs font-bold text-[#392694] shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
              En carrito x{quantity}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col space-y-3 p-4">
        <div className="space-y-1">
          {product.marca ? (
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-[#98a2b3]">
              {product.marca}
            </p>
          ) : null}
          <h4 className="line-clamp-2 text-base font-semibold leading-tight text-[#111318] sm:text-[1.1rem]">
            {product.nombre}
          </h4>
          {product.contenido ? <p className="text-xs text-[#98a2b3]">{product.contenido}</p> : null}
        </div>
        <div className="space-y-2">
          <p
            className={`product-description break-words text-sm leading-relaxed text-[#667085] ${
              descriptionExpanded ? "" : "line-clamp-2"
            }`}
          >
            {product.descripcion}
          </p>
          {hasLongDescription ? (
            <button
              type="button"
              onClick={() => setDescriptionExpanded((current) => !current)}
              className="inline-flex text-sm font-semibold text-[#6547fa] transition-colors hover:text-[#5434e6]"
            >
              {descriptionExpanded ? "Ver menos" : "Ver más"}
            </button>
          ) : null}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-bold text-[#111318] sm:text-2xl">
              {formatCurrency(product.precioVenta)}
            </span>
            {hasPreviousPrice ? (
              <span className="text-sm font-medium text-[#98a2b3] line-through">
                {formatCurrency(product.precioAnterior as number)}
              </span>
            ) : null}
          </div>

          {quantity > 0 && onDecrease && onRemove ? (
            <div className="flex items-center gap-2 rounded-[22px] border border-[#e4e7ec] bg-[#f7f8fa] px-2 py-2 shadow-sm">
              <ProductActionButton
                label={`Quitar una unidad de ${product.nombre}`}
                onClick={onDecrease}
              >
                <Minus className="h-4 w-4" />
              </ProductActionButton>
              <div className="min-w-8 text-center text-sm font-semibold text-[#111318]">
                {quantity}
              </div>
              <ProductActionButton
                label={`Agregar una unidad de ${product.nombre}`}
                onClick={onAdd}
                disabled={isOutOfStock || quantity >= availableStock}
              >
                <Plus className="h-4 w-4" />
              </ProductActionButton>
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-[#667085] transition-colors hover:bg-white hover:text-[#b44b43]"
                aria-label={`Quitar ${product.nombre} del pedido`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={isOutOfStock}
              className="app-button-primary inline-flex min-h-12 items-center gap-2 px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" />
              {isOutOfStock ? "Sin stock" : actionLabel ?? "Elegir"}
            </button>
          )}
        </div>

        {showStockCount ? (
          <div className="rounded-xl bg-[#f7f8fa] px-3 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm">
            <div className="truncate font-medium text-[#667085]">{footerLabel}</div>
            <div className="truncate font-semibold text-[#344054]">{availableStock}</div>
          </div>
        ) : (
          <div
            className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              isOutOfStock ? "bg-[#fdf1ef] text-[#8a2c22]" : "bg-[#eefbf1] text-[#1f6d33]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOutOfStock ? "bg-[#b44b43]" : "bg-[#1f9d4b]"}`} />
            {isOutOfStock ? "Agotado" : "Disponible"}
          </div>
        )}
      </div>
    </article>
  );
}

function ProductActionButton({
  children,
  label,
  onClick,
  disabled = false
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e4e7ec] bg-white text-[#111318] transition-colors hover:border-[#7357ff] hover:text-[#5434e6] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}
