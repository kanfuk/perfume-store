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
        className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,#f7f8fa_0%,#f5f3ff_58%,#eeebff_100%)] px-6 text-center ${fallbackClassName}`}
      >
        <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#5434e6] shadow-sm">
          Smellme.cl
        </span>
        <span className="max-w-[14rem] text-sm font-semibold text-[#667085]">
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
