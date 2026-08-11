"use client";

import type { ReactNode } from "react";
import { ProductImage } from "@/components/ProductImage";

type ProductImageFrameProps = {
  src?: string;
  alt: string;
  brand?: string;
  sizes: string;
  /** Insignias u overlays posicionados sobre el marco, fuera del padding de la foto. */
  children?: ReactNode;
  /**
   * Zoom uniforme (sin deformar) para compensar el letterbox que deja
   * `object-fit: contain` cuando la proporcion real de la foto no coincide
   * con la del marco fijo -- ver lib/product-image-visual-scale.ts para el
   * diagnostico completo. 1 = sin cambios (default).
   */
  visualScale?: number;
};

/**
 * Marco fotografico uniforme para Top 15 y catalogo completo (estandarizacion
 * visual de imagenes): aspect-ratio fijo, fondo neutro, overflow-hidden y un
 * padding constante alrededor de la foto para que `object-contain` nunca la
 * deje pegada al borde del marco, sin importar la proporcion original de
 * cada fotografia. Nunca deforma: la imagen entra completa y centrada; el
 * espacio restante queda integrado con el fondo del marco. `visualScale`
 * (opcional) agranda la foto ya encajada, de forma pareja en ambos ejes,
 * recortando SOLO el sobrante que cae fuera del marco (`overflow-hidden` en
 * el contenedor exterior) con un zoom moderado y acotado.
 * Reutilizado por ProductCard (imageFit="contain") -> ProductFamilyCard, el
 * mismo camino que consumen TopProductsSection y CatalogExplorer.
 */
export function ProductImageFrame({ src, alt, brand, sizes, children, visualScale = 1 }: ProductImageFrameProps) {
  return (
    <div className="relative aspect-square w-full min-w-0 overflow-hidden bg-white sm:aspect-[3/4]">
      <div className="absolute inset-0 p-3 sm:p-4">
        <div
          className="relative h-full w-full"
          style={visualScale !== 1 ? { transform: `scale(${visualScale})` } : undefined}
        >
          <ProductImage src={src} alt={alt} brand={brand} sizes={sizes} className="object-contain object-center" />
        </div>
      </div>
      {children}
    </div>
  );
}
