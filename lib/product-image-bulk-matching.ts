/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Motor de coincidencias - carga masiva de imagenes (Fase 7.3)
 * Descripcion: Funciones puras (sin Supabase, sin fetch, sin React) que
 * deciden que producto corresponde a cada archivo seleccionado por el
 * administrador. Determinista y sin adivinar: solo igualdad exacta de
 * cadenas normalizadas, en el orden de prioridad fijado por el encargo.
 * Nunca fuzzy matching, nunca IA, nunca coincidencia parcial silenciosa.
 */

import { PRODUCT_IMAGE_CONFIG, isAcceptedProductImageMimeType } from "@/lib/product-image-config";
import { BULK_PRODUCT_IMAGE_MAX_FILES } from "@/lib/constants";
import type {
  BulkImageAction,
  BulkImageCandidateProduct,
  BulkImageDecision,
  BulkImageInputFile,
  BulkImageMatchStatus,
  BulkImageRow
} from "@/lib/product-image-bulk-types";

/**
 * Sufijos que el nombre de archivo puede incluir sin dejar de considerarse
 * una coincidencia exacta de SKU/nombre (seccion 6 del encargo). Solo se
 * quitan como TOKENS finales completos -- nunca se recorta una parte
 * arbitraria del nombre.
 */
const IGNORED_TRAILING_SUFFIXES = new Set([
  "FRONT",
  "PORTADA",
  "PRINCIPAL",
  "MAIN",
  "FOTO",
  "IMAGE",
  "IMG"
]);

/**
 * Normaliza un valor (nombre de archivo sin extension, SKU, o cualquier
 * texto de identidad de producto) a una forma comparable: mayusculas,
 * espacios/guiones/guiones-bajos unificados como separador de token, y
 * sufijos ignorados removidos SOLO si aparecen al final. Cadena vacia si no
 * queda ningun token util (ej. el archivo se llamaba solo "front.jpg").
 */
export function normalizeBulkImageIdentity(raw: string): string {
  const tokens = raw
    .trim()
    .toUpperCase()
    .split(/[-_\s]+/)
    .filter((token) => token.length > 0);

  while (tokens.length > 0 && IGNORED_TRAILING_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  return tokens.join("-");
}

/** Quita la extension de un nombre de archivo (ultimo `.xxx`), sin tocar el resto. */
export function stripFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return fileName;
  return fileName.slice(0, lastDot);
}

function extensionOf(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot < 0 || lastDot === fileName.length - 1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif"
};

export type BulkImageFileValidation = { ok: true } | { ok: false; reason: string };

/**
 * Valida un archivo con EXACTAMENTE los mismos limites que el endpoint
 * individual (lib/product-image-config.ts): mismos formatos aceptados,
 * mismo tamano maximo. No inventa una restriccion distinta a la ya
 * validada en produccion.
 */
export function validateBulkImageFile(file: {
  fileName: string;
  fileSize: number;
  mimeType: string;
}): BulkImageFileValidation {
  if (!file.fileName.trim()) {
    return { ok: false, reason: "El archivo no tiene nombre." };
  }

  if (file.fileSize <= 0) {
    return { ok: false, reason: "El archivo está vacío." };
  }

  if (file.fileSize > PRODUCT_IMAGE_CONFIG.maxInputBytes) {
    return { ok: false, reason: "El archivo supera el tamaño permitido." };
  }

  const extension = extensionOf(file.fileName);
  const expectedMimeForExtension = EXTENSION_TO_MIME[extension];

  if (!expectedMimeForExtension) {
    return { ok: false, reason: "Formato no permitido. Usa JPG, PNG, WebP o AVIF." };
  }

  if (file.mimeType && !isAcceptedProductImageMimeType(file.mimeType)) {
    return { ok: false, reason: "El tipo de archivo no está permitido." };
  }

  if (file.mimeType && file.mimeType !== expectedMimeForExtension) {
    return { ok: false, reason: "La extensión del archivo no coincide con su contenido." };
  }

  return { ok: true };
}

export type BulkFileCountCheck = { ok: true } | { ok: false; reason: string };

/** Limite conservador por lote (seccion 5). Se valida ANTES de aceptar archivos nuevos en la seleccion. */
export function checkBulkFileCountLimit(
  currentCount: number,
  incomingCount: number,
  max: number = BULK_PRODUCT_IMAGE_MAX_FILES
): BulkFileCountCheck {
  if (currentCount + incomingCount > max) {
    return {
      ok: false,
      reason: `Puedes seleccionar como máximo ${max} imágenes por lote (ya tienes ${currentCount}).`
    };
  }
  return { ok: true };
}

type MatchTier = {
  status: Extract<
    BulkImageMatchStatus,
    "MATCHED_BY_SKU" | "MATCHED_BY_EXACT_NAME" | "MATCHED_BY_BRAND_NAME" | "MATCHED_BY_FULL_IDENTITY"
  >;
  key: (product: BulkImageCandidateProduct) => string | null;
};

/** Orden de prioridad fijado por la seccion 7 del encargo. Nunca reordenar ni agregar tiers nuevos sin encargo explicito. */
const MATCH_TIERS: MatchTier[] = [
  {
    status: "MATCHED_BY_SKU",
    key: (product) => (product.sku?.trim() ? normalizeBulkImageIdentity(product.sku) : null)
  },
  {
    status: "MATCHED_BY_EXACT_NAME",
    key: (product) => (product.nombre?.trim() ? normalizeBulkImageIdentity(product.nombre) : null)
  },
  {
    status: "MATCHED_BY_BRAND_NAME",
    key: (product) =>
      product.marca?.trim() && product.nombre?.trim()
        ? normalizeBulkImageIdentity(`${product.marca} ${product.nombre}`)
        : null
  },
  {
    status: "MATCHED_BY_FULL_IDENTITY",
    key: (product) =>
      product.marca?.trim() && product.nombre?.trim() && product.contenido?.trim()
        ? normalizeBulkImageIdentity(`${product.marca} ${product.nombre} ${product.contenido}`)
        : null
  }
];

type TieredMatchResult = {
  status: BulkImageMatchStatus;
  productId: string | null;
  candidateProductIds: string[];
};

/**
 * Ejecuta los 4 tiers automaticos en orden. Se detiene en el primer tier con
 * EXACTAMENTE una coincidencia. Un tier con 2+ coincidencias no descarta los
 * tiers siguientes (una marca+nombre mas especifica podria seguir
 * resolviendo de forma unica), pero si ningun tier resuelve a una sola
 * coincidencia, el resultado es AMBIGUOUS usando los candidatos del primer
 * tier que produjo 2+ coincidencias.
 */
function runAutomaticTiers(
  normalizedFileIdentity: string,
  products: readonly BulkImageCandidateProduct[]
): TieredMatchResult {
  if (!normalizedFileIdentity) {
    return { status: "UNMATCHED", productId: null, candidateProductIds: [] };
  }

  let firstAmbiguousCandidates: string[] | null = null;

  for (const tier of MATCH_TIERS) {
    const candidates = products.filter((product) => tier.key(product) === normalizedFileIdentity);

    if (candidates.length === 1) {
      return { status: tier.status, productId: candidates[0].id, candidateProductIds: [] };
    }

    if (candidates.length > 1 && firstAmbiguousCandidates === null) {
      firstAmbiguousCandidates = candidates.map((product) => product.id);
    }
  }

  if (firstAmbiguousCandidates) {
    return { status: "AMBIGUOUS", productId: null, candidateProductIds: firstAmbiguousCandidates };
  }

  return { status: "UNMATCHED", productId: null, candidateProductIds: [] };
}

function hasExistingImage(product: BulkImageCandidateProduct | undefined): boolean {
  return Boolean(product?.imageUrl?.trim() || product?.imageStoragePath?.trim());
}

export type MatchBulkProductImagesOptions = {
  /** Debe estar activo para que cualquier fila con `replaceRequested` quede lista/no bloqueante (seccion 10). */
  globalReplaceAuthorized?: boolean;
};

/**
 * Calcula el Preview completo desde cero: matching automatico, deteccion de
 * archivos invalidos, nombres duplicados, asociaciones repetidas al mismo
 * producto, productos con imagen existente, y la superposicion de
 * decisiones manuales del administrador (exclusion, asociacion manual,
 * autorizacion de reemplazo). Pura: mismo input siempre produce el mismo
 * resultado.
 */
export function matchBulkProductImages(
  files: readonly BulkImageInputFile[],
  products: readonly BulkImageCandidateProduct[],
  decisions: Readonly<Record<string, BulkImageDecision>> = {},
  options: MatchBulkProductImagesOptions = {}
): BulkImageRow[] {
  const productsById = new Map(products.map((product) => [product.id, product] as const));
  const globalReplaceAuthorized = options.globalReplaceAuthorized ?? false;

  // 1) Validacion de archivo + nombre de archivo duplicado (case-insensitive):
  // se calculan primero porque bloquean el matching por completo.
  const validations = new Map<string, BulkImageFileValidation>();
  const nameGroups = new Map<string, string[]>();

  for (const file of files) {
    validations.set(file.fileId, validateBulkImageFile(file));
    const nameKey = file.fileName.trim().toLowerCase();
    const group = nameGroups.get(nameKey) ?? [];
    group.push(file.fileId);
    nameGroups.set(nameKey, group);
  }

  const duplicateFilenameFileIds = new Set<string>();
  for (const group of nameGroups.values()) {
    const nonExcluded = group.filter((fileId) => !decisions[fileId]?.excluded);
    if (nonExcluded.length > 1) {
      for (const fileId of nonExcluded) duplicateFilenameFileIds.add(fileId);
    }
  }

  // 2) Duplicados de contenido binario (cuando el llamador provee hash):
  // se registran como advertencia, no bloquean por si solos (a diferencia
  // de un nombre de archivo duplicado).
  const contentHashGroups = new Map<string, string[]>();
  for (const file of files) {
    if (!file.contentHash) continue;
    const group = contentHashGroups.get(file.contentHash) ?? [];
    group.push(file.fileId);
    contentHashGroups.set(file.contentHash, group);
  }
  const binaryDuplicateWarningByFileId = new Map<string, string>();
  for (const group of contentHashGroups.values()) {
    if (group.length <= 1) continue;
    for (const fileId of group) {
      const others = group.filter((id) => id !== fileId);
      const otherNames = others
        .map((id) => files.find((f) => f.fileId === id)?.fileName)
        .filter((name): name is string => Boolean(name));
      binaryDuplicateWarningByFileId.set(
        fileId,
        `Contenido idéntico a: ${otherNames.join(", ")}.`
      );
    }
  }

  // 3) Matching automatico o manual, fila por fila (sin resolver aun
  // conflictos de asociacion repetida -- eso requiere ver todas las filas).
  type PartialRow = {
    file: BulkImageInputFile;
    validation: BulkImageFileValidation;
    status: BulkImageMatchStatus;
    productId: string | null;
    candidateProductIds: string[];
    warnings: string[];
  };

  const partial: PartialRow[] = files.map((file) => {
    const decision = decisions[file.fileId];
    const validation = validations.get(file.fileId)!;
    const warnings: string[] = [];
    const binaryWarning = binaryDuplicateWarningByFileId.get(file.fileId);
    if (binaryWarning) warnings.push(binaryWarning);

    if (decision?.excluded) {
      return { file, validation, status: "EXCLUDED", productId: null, candidateProductIds: [], warnings };
    }

    if (!validation.ok) {
      return {
        file,
        validation,
        status: "INVALID_FILE",
        productId: null,
        candidateProductIds: [],
        warnings: [validation.reason, ...warnings]
      };
    }

    if (duplicateFilenameFileIds.has(file.fileId)) {
      return {
        file,
        validation,
        status: "DUPLICATE_FILENAME",
        productId: null,
        candidateProductIds: [],
        warnings: ["Otro archivo seleccionado tiene el mismo nombre.", ...warnings]
      };
    }

    if (decision?.manualProductId) {
      const exists = productsById.has(decision.manualProductId);
      return {
        file,
        validation,
        status: exists ? "MANUALLY_MATCHED" : "UNMATCHED",
        productId: exists ? decision.manualProductId : null,
        candidateProductIds: [],
        warnings
      };
    }

    const normalizedIdentity = normalizeBulkImageIdentity(stripFileExtension(file.fileName));
    const tiered = runAutomaticTiers(normalizedIdentity, products);
    return {
      file,
      validation,
      status: tiered.status,
      productId: tiered.productId,
      candidateProductIds: tiered.candidateProductIds,
      warnings
    };
  });

  // 4) Asociaciones repetidas: dos o mas archivos (no excluidos, no
  // invalidos, no duplicados de nombre) apuntando al MISMO producto.
  const assignmentGroups = new Map<string, string[]>();
  for (const row of partial) {
    if (!row.productId) continue;
    if (row.status === "EXCLUDED" || row.status === "INVALID_FILE" || row.status === "DUPLICATE_FILENAME") continue;
    const group = assignmentGroups.get(row.productId) ?? [];
    group.push(row.file.fileId);
    assignmentGroups.set(row.productId, group);
  }
  const conflictingFileIds = new Set<string>();
  for (const group of assignmentGroups.values()) {
    if (group.length > 1) {
      for (const fileId of group) conflictingFileIds.add(fileId);
    }
  }

  // 5) Resolucion final por fila: conflicto de asignacion > imagen
  // existente > listo para subir.
  return partial.map((row): BulkImageRow => {
    const { file, warnings } = row;

    if (conflictingFileIds.has(file.fileId)) {
      return {
        fileId: file.fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        status: "DUPLICATE_PRODUCT_ASSIGNMENT",
        matchedProductId: row.productId,
        candidateProductIds: [],
        action: "EXCLUDE",
        ready: false,
        blocking: true,
        warnings: ["Otro archivo ya está asociado a este mismo producto.", ...warnings]
      };
    }

    if (row.status === "EXCLUDED") {
      return {
        fileId: file.fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        status: "EXCLUDED",
        matchedProductId: null,
        candidateProductIds: [],
        action: "EXCLUDE",
        ready: false,
        blocking: false,
        warnings
      };
    }

    if (row.status === "INVALID_FILE" || row.status === "DUPLICATE_FILENAME") {
      return {
        fileId: file.fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        status: row.status,
        matchedProductId: null,
        candidateProductIds: [],
        action: "EXCLUDE",
        ready: false,
        blocking: true,
        warnings
      };
    }

    if (row.status === "AMBIGUOUS" || row.status === "UNMATCHED") {
      return {
        fileId: file.fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        status: row.status,
        matchedProductId: null,
        candidateProductIds: row.candidateProductIds,
        action: "EXCLUDE",
        ready: false,
        blocking: row.status === "AMBIGUOUS",
        warnings
      };
    }

    // Coincidencia resuelta (automatica o manual): decidir SKIP/REPLACE/UPLOAD.
    const product = row.productId ? productsById.get(row.productId) : undefined;
    const decision = decisions[file.fileId];

    if (hasExistingImage(product)) {
      const replaceRequested = Boolean(decision?.replaceRequested);
      const action: BulkImageAction = replaceRequested ? "REPLACE" : "SKIP";
      const blockingReplaceNotAuthorized = replaceRequested && !globalReplaceAuthorized;
      return {
        fileId: file.fileId,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        status: "ALREADY_HAS_IMAGE",
        matchedProductId: row.productId,
        candidateProductIds: [],
        action,
        ready: replaceRequested && globalReplaceAuthorized,
        blocking: blockingReplaceNotAuthorized,
        warnings: blockingReplaceNotAuthorized
          ? ["Reemplazo no autorizado: activa \"Autorizar reemplazos seleccionados\".", ...warnings]
          : warnings
      };
    }

    return {
      fileId: file.fileId,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      status: row.status,
      matchedProductId: row.productId,
      candidateProductIds: [],
      action: "UPLOAD",
      ready: true,
      blocking: false,
      warnings
    };
  });
}

/** true si el lote puede confirmarse: al menos una fila lista y ninguna fila bloqueante (seccion 11). Las filas excluidas nunca bloquean. */
export function canConfirmBulkUpload(rows: readonly BulkImageRow[]): boolean {
  const readyCount = rows.filter((row) => row.ready).length;
  if (readyCount === 0) return false;
  return !rows.some((row) => row.blocking);
}
