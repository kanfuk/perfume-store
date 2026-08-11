/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Normalizacion visual del tamano aparente del producto dentro del
 * marco (Top 15/catalogo completo).
 *
 * Diagnostico (ver docs/SMELLME_CATALOG_IMAGE_VISUAL_SCALE_DIAGNOSIS.md):
 * un primer intento con `sharp().trim()` (recorte de margen de fondo casi
 * uniforme) resulto INEFECTIVO contra las 6 fotos reales verificadas -- 0
 * diferencia de bytes/dimensiones en las 6. Las fotos de este catalogo ya
 * vienen recortadas al limite (fondo tipo lifestyle/estudio que ocupa el
 * cuadro completo, sin margen plano que recortar); no hay nada que un
 * algoritmo de deteccion de bordes por color pueda quitar.
 *
 * La causa real es geometrica: cada foto trae su propia relacion de
 * aspecto (ej. 1275x1233 casi cuadrada vs 960x1280 vertical 3:4), pero el
 * marco (ProductImageFrame) usa una relacion FIJA (cuadrada en mobile,
 * 3:4 en desktop). `object-fit: contain` deja franjas vacias (letterbox)
 * en el eje que no coincide con esa relacion fija, y esa franja varia
 * mucho de una foto a otra -- eso es lo que se percibe como "distinto
 * porte visual", no un margen dentro de la foto misma.
 *
 * Esta tabla aplica un zoom (`transform: scale()`) modesto y acotado por
 * producto para reducir esa franja vacia, mantenida a mano en codigo (NO
 * en Supabase: es presentacion, no dato comercial). Nunca deforma (escala
 * uniforme en ambos ejes), nunca reescribe la imagen original, y el marco
 * sigue recortando cualquier sobrante con `overflow: hidden` -- por eso el
 * limite maximo es deliberadamente conservador.
 */

/** Ningun producto sin entrada en la tabla se ve afectado: el valor por defecto es 1 (sin cambios). */
const DEFAULT_VISUAL_SCALE = 1;

/** Tope de seguridad: nunca se agranda mas de un 35% aunque la tabla pida mas, para no recortar el producto mismo. */
const MAX_VISUAL_SCALE = 1.35;

/**
 * Ajustes manuales por producto (clave: `productos.id`), basados en la
 * proporcion real de cada foto vs. el marco fijo. Valores modestos y
 * acotados -- ver el diagnostico para el detalle de cada uno.
 */
const PRODUCT_IMAGE_VISUAL_SCALE: Record<string, number> = {
  "b136fac2-562b-4fd3-a88f-082db35d6d95": 1.05, // Sauvage Elixir (Dior) -- foto casi cuadrada (1275x1233)
  "8cdfc4c4-0678-4bce-941c-51fbfa35245d": 1.1, // Le Male Elixir (JPG) -- foto cuadrada (1254x1254)
  "dd93ed8e-1f24-447b-82cc-fbc38f115290": 1.05, // Le beau Le parfum (JPG) -- foto vertical cercana al marco desktop (1122x1402)
  "7c6db73a-54f5-4343-a4f6-2e449dfa8926": 1.1, // Invictus Vitory Elixir (Paco Rabanne) -- foto vertical 3:4 exacta en desktop, ajusta mobile
  "e68675f0-f85c-4dd4-8822-71217b1a7287": 1.15, // La Bomba (Carolina Herrera) -- foto ligeramente apaisada (1315x1196)
  "c8143b52-c9a0-4351-9e5e-af3424fe9c2d": 1.15 // La Vie Est Belle EDP (Lancome) -- foto ligeramente apaisada (1307x1203)
};

/** Exportado solo para prueba directa del tope de seguridad. */
export function clampVisualScale(value: number): number {
  if (!Number.isFinite(value) || value < 1) return DEFAULT_VISUAL_SCALE;
  return Math.min(value, MAX_VISUAL_SCALE);
}

/** Devuelve el zoom a aplicar en ProductImageFrame para este producto. Sin entrada -> 1 (sin cambios). */
export function getProductImageVisualScale(productId: string | undefined | null): number {
  if (!productId) return DEFAULT_VISUAL_SCALE;
  const configured = PRODUCT_IMAGE_VISUAL_SCALE[productId];
  if (configured === undefined) return DEFAULT_VISUAL_SCALE;
  return clampVisualScale(configured);
}
