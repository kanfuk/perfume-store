"use client";

import { Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { QuantitySelector } from "@/components/shared/QuantitySelector";
import { formatCurrency } from "@/lib/format";
import type { CartLine } from "@/lib/order-helpers";

type CartSummaryProps = {
  lines: CartLine[];
  total: number;
  totalItems?: number;
  onDecrease: (productId: string, nextQuantity: number) => void;
  onIncrease: (productId: string, nextQuantity: number) => void;
  onRemove: (productId: string) => void;
  emptyText?: string;
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
};

export function CartSummary({
  lines,
  total,
  totalItems,
  onDecrease,
  onIncrease,
  onRemove,
  emptyText = "Tu resumen aparecerá apenas elijas un producto.",
  title = "Resumen de tu pedido",
  subtitle = "Revisa cantidad, valor unitario y total antes de enviarlo.",
  footer
}: CartSummaryProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white shadow-soft">
      <div className="border-b border-[#e4e7ec] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-[#111318]">{title}</h3>
            <p className="mt-1 text-sm text-[#667085]">{subtitle}</p>
          </div>
          <span className="rounded-full bg-[#eeebff] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#5434e6]">
            {(totalItems ?? lines.length)} unidad{(totalItems ?? lines.length) === 1 ? "" : "es"}
          </span>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="mt-4 space-y-3">
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d0d5dd] bg-[#f9fafb] px-4 py-5 text-sm text-[#667085]">
              {emptyText}
            </div>
          ) : (
            lines.map((item) => (
              <div
                key={item.productoId}
                className="flex items-start justify-between gap-4 rounded-xl border border-[#e4e7ec] bg-[#f9fafb] px-4 py-3"
              >
                <div className="flex min-w-0 gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white sm:h-16 sm:w-16">
                    <ProductImage
                      src={item.product?.imageUrl}
                      alt={item.product?.nombre ?? "Producto"}
                      sizes="(max-width: 640px) 56px, 64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="break-words font-medium text-[#111318]">
                      {item.product?.nombre}
                    </div>
                    <div className="mt-1 text-sm text-[#667085]">
                      Valor unitario: {formatCurrency(item.product?.precioVenta ?? 0)}
                    </div>
                    <QuantitySelector
                      quantity={item.cantidad}
                      onDecrease={() => onDecrease(item.productoId, item.cantidad - 1)}
                      onIncrease={() => onIncrease(item.productoId, item.cantidad + 1)}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="text-sm font-semibold text-[#111318]">
                    {formatCurrency(item.subtotal)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.productoId)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                    Quitar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[#e4e7ec] pt-4 text-base">
          <span className="font-semibold text-[#111318]">Total</span>
          <span className="text-xl font-bold text-[#7357ff]">{formatCurrency(total)}</span>
        </div>
        {footer ? <div className="pt-2">{footer}</div> : null}
      </div>
    </div>
  );
}
