"use client";

import { useEffect, useReducer, useRef } from "react";
import Image from "next/image";
import { FlaskConical } from "lucide-react";
import {
  IMAGE_LOAD_RETRY_DELAY_MS,
  INITIAL_IMAGE_LOAD_STATE,
  MAX_IMAGE_LOAD_RETRIES,
  imageLoadReducer
} from "@/lib/product-image-fallback";
import { getProductImageRenderConfig } from "@/lib/product-image-render";

type ProductImageProps = {
  src?: string;
  alt: string;
  sizes: string;
  className?: string;
  fallbackClassName?: string;
  /** Marca del producto, mostrada en el placeholder junto a sus iniciales. */
  brand?: string;
  /**
   * Fallback compacto para miniaturas pequeñas (carrito/resumen, filas de
   * listas admin): solo iniciales sobre un fondo degradado, sin texto ni
   * badge de marca (esos elementos no caben con gracia en una miniatura y
   * se ven como un error en vez de una decisión de diseño intencional).
   */
  compact?: boolean;
  /**
   * Solicita la variante same-origin con margen de fondo recortado (ver
   * lib/product-image-trim.ts) para normalizar el tamano visual del
   * producto entre fotos. Opt-in: por defecto es `false` y el
   * comportamiento es identico al de siempre (usado por admin/carrito).
   */
  trimMargins?: boolean;
};

function getInitials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * ProductImage es un wrapper delgado sin estado propio: su UNICA
 * responsabilidad es forzar un remount COMPLETO de ProductImageInstance
 * (incluido su estado de error/reintentos) cada vez que `src` cambia.
 *
 * Un consumidor (ej. ImageCellEditor en CatalogControlCenter) puede
 * renderizar `<ProductImage>` en la MISMA posicion del arbol para dos `src`
 * distintos dentro de la misma rama de un ternario (preview local en blob: ->
 * URL real ya subida). Sin una key derivada de `src` en ESTE nivel, React
 * reutilizaria la instancia y arrastraria a la URL nueva el estado de error
 * de la URL anterior -- por eso la key vive aqui, en el wrapper, y no en
 * un elemento interno (una key en el <Image> hijo no evita que React
 * reutilice ProductImageInstance en si, que es donde vive el estado).
 */
export function ProductImage(props: ProductImageProps) {
  const key = props.src?.trim() || "__empty__";
  return <ProductImageInstance key={key} {...props} />;
}

function ProductImageInstance({
  src,
  alt,
  sizes,
  className = "object-cover",
  fallbackClassName = "",
  brand,
  compact = false,
  trimMargins = false
}: ProductImageProps) {
  const [state, dispatch] = useReducer(imageLoadReducer, INITIAL_IMAGE_LOAD_STATE);
  const timerRef = useRef<number | null>(null);
  const initials = getInitials(brand || alt);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const trimmedSrc = src?.trim();
  const showFallback = !trimmedSrc || state.failed;

  function handleError() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (state.attempt >= MAX_IMAGE_LOAD_RETRIES) {
      // Ya se agotaron los reintentos: no hay nada mas que esperar, se rinde de inmediato.
      dispatch({ type: "error" });
      return;
    }
    // Espera breve y acotada antes de reintentar (posible propagacion de
    // CDN/Storage todavia en curso). El timer se limpia si el componente se
    // desmonta o si llega un onLoad/onError posterior antes de que dispare.
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      dispatch({ type: "error" });
    }, IMAGE_LOAD_RETRY_DELAY_MS);
  }

  function handleLoad() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    dispatch({ type: "success" });
  }

  if (showFallback) {
    if (compact) {
      return (
        <div
          className={`flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#F7F1E8_0%,#F4E8DB_100%)] ${fallbackClassName}`}
          title={alt}
        >
          {initials ? (
            <span className="text-sm font-bold tracking-wide text-[#8A6036]">{initials}</span>
          ) : (
            <FlaskConical className="h-5 w-5 text-[#B88B58]" strokeWidth={1.5} />
          )}
        </div>
      );
    }

    return (
      <div
        className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,#F7F1E8_0%,#EEE5DA_58%,#F4E8DB_100%)] px-6 text-center ${fallbackClassName}`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-[#B88B58] shadow-sm">
          <FlaskConical className="h-6 w-6" strokeWidth={1.5} />
        </span>
        {initials ? (
          <span className="text-lg font-bold tracking-wide text-[#8A6036]">{initials}</span>
        ) : null}
        {brand ? (
          <span className="rounded-full bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8A6036] shadow-sm">
            {brand}
          </span>
        ) : null}
        <span className="max-w-[14rem] text-sm font-semibold text-[#6B6258]">{alt}</span>
        <span className="text-[11px] font-medium text-[#8C8175]">Imagen próximamente</span>
      </div>
    );
  }

  // `showFallback` ya fue false: `trimmedSrc` es una URL definida (no vacia).
  // getProductImageRenderConfig es la MISMA funcion que usa preloadImage
  // (ver CatalogControlCenter/AddPerfumeModal): nunca se verifica una URL y
  // se renderiza otra distinta.
  const renderConfig = getProductImageRenderConfig(trimmedSrc as string, undefined, trimMargins);

  return (
    <Image
      key={state.attempt}
      src={renderConfig.src}
      alt={alt}
      fill
      unoptimized={renderConfig.unoptimized}
      className={className}
      sizes={sizes}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
