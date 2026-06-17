"use client";

import { useState } from "react";
import Image from "next/image";

type ProductImageProps = {
  src?: string;
  alt: string;
  sizes: string;
  className?: string;
  fallbackClassName?: string;
};

export function ProductImage({
  src,
  alt,
  sizes,
  className = "object-cover",
  fallbackClassName = ""
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,#fff7eb_0%,#ffe8d9_58%,#f7d9cf_100%)] px-6 text-center ${fallbackClassName}`}
      >
        <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#a86b32] shadow-sm">
          Pauli Store
        </span>
        <span className="max-w-[14rem] text-sm font-semibold text-[#7f5b67]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      sizes={sizes}
      onError={() => setHasError(true)}
    />
  );
}
