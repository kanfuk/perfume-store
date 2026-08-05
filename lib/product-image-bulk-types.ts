/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Tipos compartidos - carga masiva de imagenes de producto (Fase 7.3)
 * Descripcion: Tipos puros (sin React, sin Supabase) compartidos entre el
 * motor de matching (lib/product-image-bulk-matching.ts), la cola de subida
 * (lib/product-image-bulk-queue.ts) y los componentes de UI.
 */

/**
 * Estados posibles de una fila del Preview. Nombres fijados por el encargo
 * de la Fase 7.3 -- no agregar variantes nuevas sin necesidad real.
 */
export type BulkImageMatchStatus =
  | "MATCHED_BY_SKU"
  | "MATCHED_BY_EXACT_NAME"
  | "MATCHED_BY_BRAND_NAME"
  | "MATCHED_BY_FULL_IDENTITY"
  | "AMBIGUOUS"
  | "UNMATCHED"
  | "DUPLICATE_FILENAME"
  | "DUPLICATE_PRODUCT_ASSIGNMENT"
  | "INVALID_FILE"
  | "ALREADY_HAS_IMAGE"
  | "MANUALLY_MATCHED"
  | "EXCLUDED";

/** Que hara el lote con esta fila si se confirma ahora mismo. */
export type BulkImageAction = "UPLOAD" | "REPLACE" | "SKIP" | "EXCLUDE";

/** Subconjunto de AdminProductRecord que el motor de matching necesita, para no acoplarlo al tipo completo. */
export type BulkImageCandidateProduct = {
  id: string;
  sku?: string;
  nombre: string;
  marca?: string;
  contenido?: string;
  imageUrl?: string;
  imageStoragePath?: string;
};

/** Metadatos de un archivo seleccionado, ya extraidos del `File` real por el componente (el motor nunca toca el DOM/File API). */
export type BulkImageInputFile = {
  /** Id local estable (no el nombre: dos archivos pueden compartir nombre). */
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Hash de contenido opcional (ej. SHA-256), calculado por el llamador para detectar duplicados binarios. */
  contentHash?: string;
};

/** Decision del administrador sobre una fila, superpuesta al resultado automatico del motor. */
export type BulkImageDecision = {
  /** true: la fila queda fuera del lote sin importar su estado automatico. */
  excluded?: boolean;
  /** Asociacion manual explicita. `null` limpia una asociacion manual previa (vuelve a automatico/sin asociar). */
  manualProductId?: string | null;
  /** Solicitud de reemplazo para un producto que ya tiene imagen (checkbox por fila). Sin efecto si el producto no tiene imagen. */
  replaceRequested?: boolean;
};

export type BulkImageRow = {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: BulkImageMatchStatus;
  matchedProductId: string | null;
  /** Productos candidatos cuando status es AMBIGUOUS (para mostrarlos en el Preview). */
  candidateProductIds: string[];
  action: BulkImageAction;
  /** true si esta fila se incluira en la cola de subida al confirmar (UPLOAD o REPLACE). */
  ready: boolean;
  /** true si esta fila bloquea el boton Confirmar (ver seccion 11 del encargo). */
  blocking: boolean;
  warnings: string[];
  /**
   * Fase 7.3A: imageStoragePath del producto EN EL MOMENTO DEL MATCHING
   * (solo poblado cuando status es ALREADY_HAS_IMAGE). Es la identidad que
   * el servidor debe confirmar que sigue vigente antes de autorizar un
   * reemplazo (compare-and-swap) -- nunca se vuelve a leer de `products`
   * mas tarde, para no capturar un valor ya refrescado tras el propio lote.
   */
  expectedImageStoragePath: string | null;
};

export type BulkQueueItemState = "PENDING" | "UPLOADING" | "SUCCESS" | "FAILED" | "SKIPPED";

export type BulkQueueJob = {
  fileId: string;
  productId: string;
  /** UPLOAD (producto sin imagen previa) o REPLACE (reemplazo autorizado). Informativo para la UI/el resumen. */
  action: "UPLOAD" | "REPLACE";
  /** Obligatorio y no vacio cuando action es REPLACE; ignorado en UPLOAD. */
  expectedImageStoragePath?: string | null;
};

export type BulkQueueSuccessData = {
  imageUrl: string;
  imageStoragePath: string;
};

export type BulkQueueResult = {
  fileId: string;
  productId: string;
  action: "UPLOAD" | "REPLACE";
  state: "SUCCESS" | "FAILED" | "SKIPPED";
  data?: BulkQueueSuccessData;
  /** Mensaje seguro en espanol, nunca stack traces ni detalles internos. */
  error?: string;
};
