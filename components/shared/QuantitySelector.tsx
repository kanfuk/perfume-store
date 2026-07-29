"use client";

import { Minus, Plus } from "lucide-react";

type QuantitySelectorProps = {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  minLabel?: string;
  maxLabel?: string;
};

export function QuantitySelector({
  quantity,
  onDecrease,
  onIncrease,
  minLabel = "Reducir cantidad",
  maxLabel = "Aumentar cantidad"
}: QuantitySelectorProps) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <QuantityButton label={minLabel} onClick={onDecrease}>
        <Minus className="h-4 w-4" />
      </QuantityButton>
      <div className="min-w-10 text-center text-sm font-semibold text-[#111318]">
        {quantity}
      </div>
      <QuantityButton label={maxLabel} onClick={onIncrease}>
        <Plus className="h-4 w-4" />
      </QuantityButton>
    </div>
  );
}

function QuantityButton({
  children,
  label,
  onClick
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-2xl border border-[#e4e7ec] bg-white text-[#111318] transition-colors hover:border-[#7357ff] hover:text-[#5434e6]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
