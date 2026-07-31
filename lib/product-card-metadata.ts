/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Normalizacion de metadatos - Fase 2B.13
 * Descripcion: Logica pura (sin React) que decide que muestra una tarjeta
 * publica cuando faltan datos (marca y/o contenido). Extraida de
 * ProductCard.tsx para poder probarla sin un entorno de render (Vitest usa
 * environment: "node", sin jsdom). Nunca inventa un valor faltante ni
 * muestra texto tecnico ("undefined", "null", "0ML"): simplemente decide si
 * la linea correspondiente se renderiza o se deja como espacio reservado.
 */

export type CardMetadataInput = {
  marca?: string | null;
  contenido?: string | null;
};

export type CardMetadataResult = {
  /** Verdadero si hay marca para mostrar; falso reserva el espacio sin texto tecnico. */
  hasBrand: boolean;
  brandLabel: string;
  /** Verdadero si hay contenido/variante para mostrar (cuando no hay selector de variantes). */
  hasContent: boolean;
  contentLabel: string;
};

/**
 * Resuelve que debe mostrarse en las lineas de marca y contenido de una
 * tarjeta publica. `contenido` faltante nunca se muestra como "0ML" ni
 * "SIN DATO": simplemente no se renderiza (el espacio se reserva por CSS,
 * no por texto de relleno).
 */
export function resolveCardMetadata(product: CardMetadataInput): CardMetadataResult {
  const marca = (product.marca ?? "").trim();
  const contenido = (product.contenido ?? "").trim();

  return {
    hasBrand: marca !== "",
    brandLabel: marca,
    hasContent: contenido !== "",
    contentLabel: contenido
  };
}
