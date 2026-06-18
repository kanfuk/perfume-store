"use client";

import { Plus } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { formatCurrency } from "@/lib/format";
import type { ProductRecord } from "@/lib/types";

type ProductCardProps = {
  product: ProductRecord;
  quantity?: number;
  onAdd: () => void;
  actionLabel?: string;
  footerLabel?: string;
};

export function ProductCard({
  product,
  quantity = 0,
  onAdd,
  actionLabel,
  footerLabel = "Disponibles hoy"
}: ProductCardProps) {
  const isOutOfStock = (product.stockActual ?? 0) <= 0;

  return (
    <article className="flex h-full max-w-full flex-col overflow-hidden rounded-[28px] border border-[#eedcc3] bg-white shadow-sm transition-[border-color,box-shadow,background-color] duration-200 touch-manipulation hover:shadow-soft">
      <div className="relative aspect-[4/3] min-w-0 bg-[#fff5e8]">
        <ProductImage
          src={product.imageUrl ?? "/images/products/dobladita-ave-mayo.png"}
          alt={product.nombre}
          sizes="(max-width: 768px) calc(100vw - 3rem), 50vw"
          className="object-cover"
        />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <span className="rounded-full border border-white/15 bg-[#512a38]/82 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm backdrop-blur-md">
            {product.badgeLabel || product.tipoProducto || "PRODUCTO CASERO"}
          </span>
          {quantity > 0 ? (
            <span className="rounded-full border border-white/35 bg-[#fff2d8]/96 px-3 py-1 text-xs font-semibold text-[#7a4a1f] shadow-sm backdrop-blur-md">
              En carrito x{quantity}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col space-y-4 p-4">
        <div className="space-y-2">
          <h4 className="text-lg font-semibold text-[#5f3041]">{product.nombre}</h4>
          <p className="copy-justified text-sm leading-6 text-[#7f5b67]">
            {product.descripcion}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#a86b32]">
              Valor unitario
            </div>
            <div className="mt-1 text-2xl font-bold text-[#5f3041]">
              {formatCurrency(product.precioVenta)}
            </div>
          </div>
          <button
            type="button"
            onClick={onAdd}
            disabled={isOutOfStock}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#a86b32] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#8f5728] disabled:cursor-not-allowed disabled:bg-[#d7b894]"
          >
            <Plus className="h-4 w-4" />
            {isOutOfStock ? "Sin stock" : actionLabel ?? (quantity > 0 ? "Agregar otra" : "Elegir")}
          </button>
        </div>
        <div className="flex items-center justify-between rounded-[18px] bg-[#fff6e7] px-4 py-3 text-sm">
          <span className="font-medium text-[#7f5b67]">{footerLabel}</span>
          <span className="font-semibold text-[#8f5728]">
            {Math.max(product.stockActual ?? 0, 0)}
          </span>
        </div>
      </div>
    </article>
  );
}
