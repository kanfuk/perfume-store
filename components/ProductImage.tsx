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
        className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,#faf7f1_0%,#f2ece0_58%,#dff1e5_100%)] px-6 text-center ${fallbackClassName}`}
      >
        <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#6b4a26] shadow-sm">
          Smellme.cl
        </span>
        <span className="max-w-[14rem] text-sm font-semibold text-[#74695c]">
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
