"use client";

import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { formatCurrency } from "@/lib/format";
import { getAvailableProductStock } from "@/lib/stock";
import { resolveCardMetadata } from "@/lib/product-card-metadata";
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
  /** Selector de tamano de una familia de producto (reemplaza la linea estatica de `contenido`). */
  sizeSelector?: React.ReactNode;
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
  rank,
  sizeSelector
}: ProductCardProps) {
  const availableStock = getAvailableProductStock(product);
  const isOutOfStock = availableStock <= 0;
  const metadata = resolveCardMetadata(product);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const hasLongDescription = (product.descripcion?.trim().length ?? 0) > 96;
  const hasPreviousPrice =
    typeof product.precioAnterior === "number" && product.precioAnterior > product.precioVenta;

  return (
    <article className="interactive-card flex h-full max-w-full touch-manipulation flex-col overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white shadow-sm">
      <div
        className={`relative min-w-0 ${
          imageFit === "contain" ? "aspect-square bg-white sm:aspect-[3/4]" : "aspect-[4/3] bg-[#f7f8fa]"
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
        <div
          className={`absolute inset-x-0 top-0 flex items-start justify-between gap-3 ${
            imageFit === "contain" ? "p-2.5 sm:p-4" : "p-4"
          }`}
        >
          <div className="flex items-center gap-2">
            {typeof rank === "number" ? (
              <span
                className={`flex items-center justify-center rounded-full bg-[#7357ff] font-bold text-white shadow-sm ${
                  imageFit === "contain" ? "h-6 w-6 text-xs sm:h-8 sm:w-8 sm:text-sm" : "h-8 w-8 text-sm"
                }`}
              >
                {rank}
              </span>
            ) : null}
            <span
              className={`rounded-full border font-semibold uppercase tracking-wide shadow-sm backdrop-blur-md ${
                imageFit === "contain"
                  ? "hidden border-[#e4e7ec] bg-white/90 px-3 py-1 text-xs text-[#111318] sm:inline-block"
                  : "border-white/15 bg-[#111318]/82 px-3 py-1 text-xs text-white"
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
      <div
        className={`flex flex-1 flex-col ${
          imageFit === "contain" ? "space-y-2 p-3 sm:space-y-3 sm:p-4" : "space-y-3 p-4"
        }`}
      >
        {/* Bloque de metadatos con altura reservada (Fase 2B.13): marca, nombre y */}
        {/* contenido/selector SIEMPRE ocupan el mismo espacio, tenga o no el */}
        {/* producto esos datos. Es la causa real del desalineamiento anterior: una */}
        {/* tarjeta sin marca/contenido rendeaba menos lineas y "subia" el precio y */}
        {/* el CTA. Nunca se muestra "undefined"/"null"/"0ML": el hueco queda en */}
        {/* blanco (&nbsp; oculto a lectores de pantalla) pero conserva su altura. */}
        <div className="space-y-1">
          <p
            className="truncate text-xs font-semibold uppercase tracking-wide text-[#98a2b3]"
            aria-hidden={metadata.hasBrand ? undefined : true}
          >
            {metadata.hasBrand ? metadata.brandLabel : " "}
          </p>
          <h4
            className={`line-clamp-2 font-semibold leading-tight text-[#111318] sm:min-h-11 sm:text-[1.1rem] ${
              imageFit === "contain" ? "min-h-9 text-sm" : "min-h-10 text-base"
            }`}
          >
            {product.nombre}
          </h4>
          <div className={imageFit === "contain" ? "flex min-h-16 flex-col" : "flex min-h-[1.25rem] flex-col"}>
            {sizeSelector ?? (
              <p className="text-xs text-[#98a2b3]" aria-hidden={metadata.hasContent ? undefined : true}>
                {metadata.hasContent ? metadata.contentLabel : " "}
              </p>
            )}
          </div>
        </div>
        {imageFit !== "contain" ? (
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
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex flex-wrap items-baseline gap-2">
            <span
              className={`font-bold text-[#111318] ${
                imageFit === "contain" ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl"
              }`}
            >
              {formatCurrency(product.precioVenta)}
            </span>
            {hasPreviousPrice ? (
              <span className="text-sm font-medium text-[#98a2b3] line-through">
                {formatCurrency(product.precioAnterior as number)}
              </span>
            ) : null}
          </div>

          {quantity > 0 && onDecrease && onRemove ? (
            <div
              className={`flex items-center border border-[#e4e7ec] bg-[#f7f8fa] shadow-sm ${
                imageFit === "contain" ? "gap-1 rounded-full px-1.5 py-1.5" : "gap-2 rounded-[22px] px-2 py-2"
              }`}
            >
              <ProductActionButton
                label={`Quitar una unidad de ${product.nombre}`}
                onClick={onDecrease}
                compact={imageFit === "contain"}
              >
                <Minus className={imageFit === "contain" ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </ProductActionButton>
              <div
                className={`text-center font-semibold text-[#111318] ${
                  imageFit === "contain" ? "min-w-5 text-xs" : "min-w-8 text-sm"
                }`}
              >
                {quantity}
              </div>
              <ProductActionButton
                label={`Agregar una unidad de ${product.nombre}`}
                onClick={onAdd}
                disabled={isOutOfStock || quantity >= availableStock}
                compact={imageFit === "contain"}
              >
                <Plus className={imageFit === "contain" ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </ProductActionButton>
              <button
                type="button"
                onClick={onRemove}
                className={`inline-flex items-center justify-center text-[#667085] transition-colors hover:bg-white hover:text-[#b44b43] ${
                  imageFit === "contain" ? "h-8 w-8 rounded-full" : "h-10 w-10 rounded-2xl"
                }`}
                aria-label={`Quitar ${product.nombre} del pedido`}
              >
                <Trash2 className={imageFit === "contain" ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </button>
            </div>
          ) : imageFit === "contain" ? (
            <button
              type="button"
              onClick={onAdd}
              disabled={isOutOfStock}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#7357ff] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_6px_14px_rgba(115,87,255,0.22)] transition hover:bg-[#5b3ff2] disabled:cursor-not-allowed disabled:bg-[#c7bfff] disabled:shadow-none"
            >
              <Plus className="h-3.5 w-3.5" />
              {isOutOfStock ? "Sin stock" : actionLabel ?? "Elegir"}
            </button>
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
  disabled = false,
  compact = false
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Version reducida (Top 12 en movil) para que el stepper combine con el CTA compacto. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center border border-[#e4e7ec] bg-white text-[#111318] transition-colors hover:border-[#7357ff] hover:text-[#5434e6] disabled:cursor-not-allowed disabled:opacity-45 ${
        compact ? "h-8 w-8 rounded-full" : "h-10 w-10 rounded-2xl"
      }`}
    >
      {children}
    </button>
  );
}
