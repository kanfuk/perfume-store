"use client";

import { useState } from "react";
import Image from "next/image";
import { FlaskConical } from "lucide-react";

type ProductImageProps = {
  src?: string;
  alt: string;
  sizes: string;
  className?: string;
  fallbackClassName?: string;
  /** Marca del producto, mostrada en el placeholder junto a sus iniciales. */
  brand?: string;
};

function getInitials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Placeholder premium para productos sin fotografia propia. Nunca inventa
 * una foto real: muestra un icono de frasco estilizado, marca + iniciales, y
 * un aviso discreto de "Imagen próximamente" -- el producto sigue siendo
 * comprable, no se oculta del catalogo.
 */
export function ProductImage({
  src,
  alt,
  sizes,
  className = "object-cover",
  fallbackClassName = "",
  brand
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);
  const initials = getInitials(brand || alt);

  if (!src || hasError) {
    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,#f7f8fa_0%,#f5f3ff_58%,#eeebff_100%)] px-6 text-center ${fallbackClassName}`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-[#7357ff] shadow-sm">
          <FlaskConical className="h-6 w-6" strokeWidth={1.5} />
        </span>
        {initials ? (
          <span className="text-lg font-bold tracking-wide text-[#5434e6]">{initials}</span>
        ) : null}
        {brand ? (
          <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#5434e6] shadow-sm">
            {brand}
          </span>
        ) : null}
        <span className="max-w-[14rem] text-sm font-semibold text-[#667085]">{alt}</span>
        <span className="text-[11px] font-medium text-[#98a2b3]">Imagen próximamente</span>
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
