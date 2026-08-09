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
    <div className="overflow-hidden rounded-2xl border border-[#DDD0C1] bg-white shadow-soft">
      <div className="border-b border-[#DDD0C1] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-[#191714]">{title}</h3>
            <p className="mt-1 text-sm text-[#6B6258]">{subtitle}</p>
          </div>
          <span className="rounded-full bg-[#F4E8DB] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#8A6036]">
            {(totalItems ?? lines.length)} unidad{(totalItems ?? lines.length) === 1 ? "" : "es"}
          </span>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="mt-4 space-y-3">
          {lines.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d0d5dd] bg-[#f9fafb] px-4 py-5 text-sm text-[#6B6258]">
              {emptyText}
            </div>
          ) : (
            lines.map((item) => (
              <div
                key={item.productoId}
                className="flex items-start justify-between gap-4 rounded-xl border border-[#DDD0C1] bg-[#f9fafb] px-4 py-3"
              >
                <div className="flex min-w-0 gap-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#DDD0C1] bg-white sm:h-16 sm:w-16">
                    <ProductImage
                      src={item.product?.imageUrl}
                      alt={item.product?.nombre ?? "Producto"}
                      brand={item.product?.marca}
                      sizes="(max-width: 640px) 56px, 64px"
                      className="object-cover"
                      compact
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="break-words font-medium text-[#191714]">
                      {item.product?.nombre}
                      {item.product?.contenido ? (
                        <span className="ml-1.5 text-sm font-normal text-[#6B6258]">
                          · {item.product.contenido}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-[#6B6258]">
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
                  <div className="text-sm font-semibold text-[#191714]">
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
        <div className="mt-4 flex items-center justify-between border-t border-[#DDD0C1] pt-4 text-base">
          <span className="font-semibold text-[#191714]">Total</span>
          <span className="text-xl font-bold text-[#B88B58]">{formatCurrency(total)}</span>
        </div>
        {footer ? <div className="pt-2">{footer}</div> : null}
      </div>
    </div>
  );
}
