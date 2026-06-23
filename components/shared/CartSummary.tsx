"use client";

import { Trash2 } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";
import { QuantitySelector } from "@/components/shared/QuantitySelector";
import { formatCurrency } from "@/lib/format";
import type { CartLine } from "@/lib/order-helpers";

type CartSummaryProps = {
  lines: CartLine[];
  total: number;
  onDecrease: (productId: string, nextQuantity: number) => void;
  onIncrease: (productId: string, nextQuantity: number) => void;
  onRemove: (productId: string) => void;
  emptyText?: string;
  title?: string;
  subtitle?: string;
};

export function CartSummary({
  lines,
  total,
  onDecrease,
  onIncrease,
  onRemove,
  emptyText = "Tu resumen aparecerá apenas elijas un producto.",
  title = "Tu pedido",
  subtitle = "Revisa cantidad, valor unitario y total antes de enviarlo."
}: CartSummaryProps) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-[#d8ebdd] bg-white/95 shadow-soft">
      <div className="bg-[linear-gradient(180deg,#f6fcf7_0%,#eef8f0_100%)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#1f3328]">{title}</h3>
            <p className="copy-justified mt-1 text-sm text-[#6b7c70]">{subtitle}</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#247a4d]">
            {lines.length} producto{lines.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="mt-4 space-y-3">
          {lines.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-[#d8ebdd] bg-[#fff9ef] px-4 py-5 text-sm text-[#6b7c70]">
              {emptyText}
            </div>
          ) : (
            lines.map((item) => (
              <div
                key={item.productoId}
                className="flex items-start justify-between gap-4 rounded-[22px] border border-[#d8ebdd] bg-[#f6fcf7] px-4 py-3"
              >
                <div className="flex min-w-0 gap-3">
                  <div className="relative hidden h-16 w-16 shrink-0 overflow-hidden rounded-[16px] border border-[#d8ebdd] bg-white sm:block">
                    <ProductImage
                      src={item.product?.imageUrl ?? "/images/products/pedido-personalizado.png"}
                      alt={item.product?.nombre ?? "Producto"}
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="break-words font-medium text-[#1f3328]">
                      {item.product?.nombre}
                    </div>
                    <div className="mt-1 text-sm text-[#6b7c70]">
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
                  <div className="text-sm font-semibold text-[#247a4d]">
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
        <div className="mt-4 flex items-center justify-between border-t border-[#d8ebdd] pt-4 text-base">
          <span className="font-semibold text-[#1f3328]">Total</span>
          <span className="font-semibold text-[#247a4d]">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
