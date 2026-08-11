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
};

/**
 * Marco fotografico uniforme para Top 15 y catalogo completo (estandarizacion
 * visual de imagenes): aspect-ratio fijo, fondo neutro, overflow-hidden y un
 * padding constante alrededor de la foto para que `object-contain` nunca la
 * deje pegada al borde del marco, sin importar la proporcion original de
 * cada fotografia. Nunca recorta ni deforma: la imagen entra completa y
 * centrada; el espacio restante queda integrado con el fondo del marco.
 * Reutilizado por ProductCard (imageFit="contain") -> ProductFamilyCard, el
 * mismo camino que consumen TopProductsSection y CatalogExplorer.
 *
 * `trimMargins` (siempre activo aqui): cada foto original trae una
 * cantidad distinta de fondo vacio alrededor del producto, asi que aunque
 * el marco sea identico, el producto se ve de distinto porte visual entre
 * tarjetas. Solicitar la variante recortada (ver lib/product-image-trim.ts)
 * normaliza cuanto "aire" queda alrededor del producto SIN recortar el
 * producto en si ni deformarlo -- solo aqui, nunca en admin/carrito
 * (ProductCard con imageFit="cover" sigue pidiendo la imagen original).
 */
export function ProductImageFrame({ src, alt, brand, sizes, children }: ProductImageFrameProps) {
  return (
    <div className="relative aspect-square w-full min-w-0 overflow-hidden bg-white sm:aspect-[3/4]">
      <div className="absolute inset-0 p-3 sm:p-4">
        <div className="relative h-full w-full">
          <ProductImage
            src={src}
            alt={alt}
            brand={brand}
            sizes={sizes}
            className="object-contain object-center"
            trimMargins
          />
        </div>
      </div>
      {children}
    </div>
  );
}
