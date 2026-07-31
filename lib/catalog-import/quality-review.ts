/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Asistente de calidad (Fase 2B.7)
 * Descripcion: Motor puro y determinista que revisa el CSV de proveedor ya
 * parseado (lib/catalog-import/supplier-import.ts) ANTES de construir el plan
 * final de importacion. Detecta normalizaciones seguras, duplicados exactos,
 * posibles duplicados, variantes por contenido, incoherencias de marca/nombre,
 * coincidencias con el catalogo existente y anomalias de costo. No escribe
 * nada, no llama servicios externos, no usa IA remota. Las decisiones humanas
 * se aplican en un segundo paso (`applyQualityDecisions`) que regenera el plan
 * final (SKU incluido) SOLO a partir de las filas crudas + decisiones, nunca
 * confiando en valores derivados que pudiera enviar el navegador.
 */

import {
  normalizeMatchKey,
  normalizeContenido,
  buildReconciliationKey,
  levenshteinDistance,
  isStandardVolumeContent
} from "./normalization.ts";
import { buildSkuBase, assignDeterministicSkus } from "./sku.ts";
import { calculateSalePrice } from "./supplier-import.ts";
import type { SupplierImportRow, SupplierModoPrecio } from "./supplier-import.ts";

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export type QualityFindingType =
  | "SAFE_NORMALIZATION"
  | "EXACT_DUPLICATE"
  | "POSSIBLE_DUPLICATE"
  | "VARIANT"
  | "BRAND_INCONSISTENCY"
  | "NAME_INCONSISTENCY"
  | "EXISTING_CATALOG_MATCH"
  | "PRICE_ANOMALY"
  | "MISSING_NAME"
  | "MISSING_BRAND"
  | "MISSING_CONTENT"
  | "INVALID_CONTENT";

export type QualityFindingSeverity = "INFO" | "WARNING" | "BLOCKER";

export type QualityFindingOption = {
  id: string;
  label: string;
};

/** Snapshot de una fila (o del catalogo existente) para mostrar comparaciones lado a lado. */
export type QualityRowSnapshot = {
  rowNumber: number;
  marca: string;
  nombre: string;
  contenido: string;
  costo: number;
};

export type QualityExistingSnapshot = {
  productId: string;
  sku: string;
  marca: string;
  nombre: string;
  contenido: string;
  costoUnitario: number;
  precioVenta: number;
  modoPrecio: SupplierModoPrecio;
};

export type QualityFinding = {
  id: string;
  type: QualityFindingType;
  severity: QualityFindingSeverity;
  rowNumbers: number[];
  existingProductId?: string;
  explanation: string;
  rows: QualityRowSnapshot[];
  existing?: QualityExistingSnapshot;
  original?: Record<string, string | number | null>;
  suggested?: Record<string, string | number | null>;
  options: QualityFindingOption[];
};

/** Decision humana sobre un hallazgo. Estructura minima y auditable. */
export type QualityDecision = {
  findingId: string;
  optionId: string;
  /** Nombre canonico manual (SET_CANONICAL_NAME) o marca manual (SET_BRAND_MANUAL). */
  textValue?: string;
  /** Costo editado manualmente (EDIT_COST). */
  numberValue?: number;
  /** Que costo conservar al unificar/actualizar: la fila indicada por numero. */
  costFromRow?: number;
  /** Producto existente elegido explicitamente (EXISTING_CATALOG_MATCH). */
  targetProductId?: string;
  /** Aplica esta decision de marca a todas las filas con la misma variante detectada. */
  applyToAllInFile?: boolean;
};

export type ExistingProductForReview = QualityExistingSnapshot;

// ---------------------------------------------------------------------------
// Normalizacion segura (aplicada automaticamente, siempre registrada)
// ---------------------------------------------------------------------------

/** Siglas y tokens que nunca deben "corregirse" a formato titulo. */
const PRESERVED_TOKENS = new Set(["edp", "edt", "vip", "nyc", "myslf", "edc"]);

function isPureNumberToken(token: string): boolean {
  return /^\d+([.,]\d+)?$/.test(token);
}

function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  const first = word.charAt(0).toLocaleUpperCase();
  const rest = word.slice(1).toLocaleLowerCase();
  return first + rest;
}

/**
 * Normaliza capitalizacion de forma segura: title-case por palabra,
 * preservando siglas conocidas (EDP/EDT/VIP/NYC/MYSLF) y numeros. Nunca
 * corrige ortografia ("Necrar" sigue siendo "Necrar"). Conserva tildes.
 */
export function normalizeCasingSafe(value: string): { value: string; changed: boolean } {
  const original = value;
  if (original.trim() === "") return { value: original, changed: false };

  const tokens = original.split(" ");
  const normalizedTokens = tokens.map((token) => {
    if (token === "") return token;
    const bare = token.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "");
    if (isPureNumberToken(bare)) return token;

    const bareLower = bare.toLocaleLowerCase();
    if (PRESERVED_TOKENS.has(bareLower)) return token.toLocaleUpperCase();

    const isAlreadyAcronymLike =
      token === token.toLocaleUpperCase() && token !== token.toLocaleLowerCase() && bare.length <= 5;
    if (isAlreadyAcronymLike) return token;

    return titleCaseWord(token);
  });

  const normalized = normalizedTokens.join(" ");
  return { value: normalized, changed: normalized !== original };
}

/** Normaliza el costo a un entero valido (>=0) o null si es invalido/ausente. */
export function normalizeCostSafe(value: number): { value: number; changed: boolean } {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  return { value: rounded, changed: rounded !== value };
}

export type NormalizedRow = {
  rowNumber: number;
  marca: string;
  nombre: string;
  contenido: string;
  costo: number;
  originalMarca: string;
  originalNombre: string;
  originalContenido: string;
  originalCosto: number;
  safeChanges: Array<"marca" | "nombre" | "contenido" | "costo">;
};

export function buildNormalizedRow(row: SupplierImportRow): NormalizedRow {
  const marca = normalizeCasingSafe(row.marca);
  const nombre = normalizeCasingSafe(row.perfume);
  const contenidoValue = normalizeContenido(row.contenido);
  const costo = normalizeCostSafe(row.precioCompra);

  const safeChanges: NormalizedRow["safeChanges"] = [];
  if (marca.changed) safeChanges.push("marca");
  if (nombre.changed) safeChanges.push("nombre");
  if (contenidoValue !== row.contenido) safeChanges.push("contenido");
  if (costo.changed) safeChanges.push("costo");

  return {
    rowNumber: row.rowNumber,
    marca: marca.value,
    nombre: nombre.value,
    contenido: contenidoValue,
    costo: costo.value,
    originalMarca: row.marca,
    originalNombre: row.perfume,
    originalContenido: row.contenido,
    originalCosto: row.precioCompra,
    safeChanges
  };
}

export function buildNormalizedRows(rows: SupplierImportRow[]): NormalizedRow[] {
  return rows.map(buildNormalizedRow);
}

function toSnapshot(row: NormalizedRow): QualityRowSnapshot {
  return { rowNumber: row.rowNumber, marca: row.marca, nombre: row.nombre, contenido: row.contenido, costo: row.costo };
}

// ---------------------------------------------------------------------------
// Similitud de texto (funcion propia, sin dependencias externas)
// ---------------------------------------------------------------------------

/** Coeficiente de Dice sobre bigramas de caracteres. Determinista, sin dependencias. */
export function diceBigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) {
      const gram = s.slice(i, i + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };

  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  let intersection = 0;
  for (const [gram, countA] of bigramsA) {
    const countB = bigramsB.get(gram);
    if (countB) intersection += Math.min(countA, countB);
  }

  const totalA = Math.max(a.length - 1, 1);
  const totalB = Math.max(b.length - 1, 1);
  return (2 * intersection) / (totalA + totalB);
}

/** Similitud basada en distancia de Levenshtein normalizada por longitud. */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Similitud combinada (0..1) usada para nombres candidatos: promedio de
 * Dice-bigrama y Levenshtein normalizado. Solo se usa para SUGERIR
 * candidatos de revision humana, nunca para fusionar automaticamente.
 */
export function nameSimilarity(a: string, b: string): number {
  return (diceBigramSimilarity(a, b) + levenshteinSimilarity(a, b)) / 2;
}

/**
 * Vocabulario cerrado de descriptores de concentracion/formulacion (mismo
 * espiritu que CONCENTRATION_WORDS de normalization.ts, ampliado con frases).
 * Se usa UNICAMENTE para construir una clave de "candidato" secundaria que
 * ayuda a encontrar posibles duplicados; nunca para la identidad ni el
 * nombre final.
 */
const CONCENTRATION_PHRASES = [
  "eau de parfum",
  "eau de toilette",
  "eau de cologne",
  "eau de toilete"
];

const CONCENTRATION_WORDS = new Set([
  "edt",
  "edp",
  "edc",
  "parfum",
  "perfume",
  "elixir",
  "cologne",
  "colonia",
  "intense",
  "extreme",
  "absolu",
  "extrait",
  "toilette",
  "toilete",
  "eau",
  "de"
]);

/** Clave de candidato: identidad de nombre sin marca repetida ni descriptores de concentracion. */
export function buildCandidateNameKey(nombre: string, marca: string): string {
  let text = normalizeMatchKey(nombre);
  for (const phrase of CONCENTRATION_PHRASES) {
    text = text.replaceAll(phrase, " ");
  }
  const brandTokens = new Set(normalizeMatchKey(marca).split(" ").filter(Boolean));
  const tokens = text
    .split(" ")
    .filter((token) => token !== "" && !brandTokens.has(token) && !CONCENTRATION_WORDS.has(token));
  return tokens.join(" ");
}

const DESCRIPTOR_VOCABULARY = [...CONCENTRATION_WORDS].filter((w) => w !== "eau" && w !== "de");

/**
 * Verdadero si TODA la diferencia de tokens entre dos nombres normalizados
 * corresponde a descriptores de concentracion/formulacion (EDT/EDP/Parfum/
 * Elixir/Intense/...). Estos modificadores son importantes (seccion 10 de la
 * fase): dos nombres que solo difieren en ellos pueden ser productos
 * legitimamente distintos, asi que nunca deben forzar un bloqueo automatico
 * (BLOCKER); como maximo generan una advertencia (WARNING) para decision
 * humana.
 */
function isConcentrationOnlyDifference(nameA: string, nameB: string): boolean {
  const tokensA = normalizeMatchKey(nameA).split(" ").filter(Boolean);
  const tokensB = normalizeMatchKey(nameB).split(" ").filter(Boolean);
  const setA = new Map<string, number>();
  const setB = new Map<string, number>();
  for (const t of tokensA) setA.set(t, (setA.get(t) ?? 0) + 1);
  for (const t of tokensB) setB.set(t, (setB.get(t) ?? 0) + 1);

  const diffTokens: string[] = [];
  for (const [token, count] of setA) {
    const extra = count - (setB.get(token) ?? 0);
    for (let i = 0; i < extra; i += 1) diffTokens.push(token);
  }
  for (const [token, count] of setB) {
    const extra = count - (setA.get(token) ?? 0);
    for (let i = 0; i < extra; i += 1) diffTokens.push(token);
  }

  if (diffTokens.length === 0) return false;
  return diffTokens.every((token) => CONCENTRATION_WORDS.has(token));
}

/** Detecta typos de descriptores conocidos (ej. "parfm" ~ "parfum") sin diccionario externo. */
function findNearDescriptorTypo(nombre: string): { original: string; suggested: string } | null {
  const tokens = normalizeMatchKey(nombre).split(" ").filter(Boolean);
  for (const token of tokens) {
    if (token.length < 4) continue;
    if (CONCENTRATION_WORDS.has(token)) continue;
    for (const descriptor of DESCRIPTOR_VOCABULARY) {
      if (Math.abs(token.length - descriptor.length) > 1) continue;
      const distance = levenshteinDistance(token, descriptor);
      if (distance === 1) {
        return { original: token, suggested: descriptor };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers de construccion de hallazgos
// ---------------------------------------------------------------------------

function makeId(type: QualityFindingType, parts: Array<string | number>): string {
  return `${type}:${parts.join("|")}`;
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CL")}`;
}

// ---------------------------------------------------------------------------
// 0. Datos obligatorios faltantes o invalidos (Fase 2B.13)
// ---------------------------------------------------------------------------

/**
 * Detecta filas sin nombre, marca o contenido (bloqueante: no se puede
 * importar ni publicar un producto sin esos datos, y nunca se inventan), y
 * filas con contenido no vacio pero que no matchea un volumen estandar
 * reconocido (advertencia: puede ser un formato especial legitimo -- set,
 * estuche, tester -- que requiere confirmacion explicita, no un bloqueo
 * automatico). El costo faltante/invalido NO se trata aqui: ya lo cubre
 * `detectPriceAnomalies` (severidad BLOCKER cuando costo <= 0), evitando
 * duplicar el mismo hallazgo con dos tipos distintos.
 */
export function detectMissingOrInvalidFields(rows: NormalizedRow[]): QualityFinding[] {
  const findings: QualityFinding[] = [];

  for (const row of rows) {
    const nombreVacio = row.originalNombre.trim() === "";
    const marcaVacia = row.originalMarca.trim() === "";
    const contenidoVacio = row.originalContenido.trim() === "";

    if (nombreVacio) {
      findings.push({
        id: makeId("MISSING_NAME", [row.rowNumber]),
        type: "MISSING_NAME",
        severity: "BLOCKER",
        rowNumbers: [row.rowNumber],
        explanation: `La fila ${row.rowNumber} no tiene nombre de perfume. No se puede importar ni publicar sin un nombre; escríbelo o excluye la fila.`,
        rows: [toSnapshot(row)],
        original: { nombre: row.originalNombre },
        options: [
          { id: "EDIT_NAME", label: "Escribir nombre" },
          { id: "EXCLUDE_FIRST", label: `Excluir fila ${row.rowNumber} de esta importación` }
        ]
      });
    }

    if (marcaVacia) {
      findings.push({
        id: makeId("MISSING_BRAND", [row.rowNumber]),
        type: "MISSING_BRAND",
        severity: "BLOCKER",
        rowNumbers: [row.rowNumber],
        explanation: `La fila ${row.rowNumber} no tiene marca. No se puede importar ni publicar sin una marca; escríbela o excluye la fila.`,
        rows: [toSnapshot(row)],
        original: { marca: row.originalMarca },
        options: [
          { id: "SET_BRAND_MANUAL", label: "Escribir marca" },
          { id: "EXCLUDE_FIRST", label: `Excluir fila ${row.rowNumber} de esta importación` }
        ]
      });
    }

    if (contenidoVacio) {
      findings.push({
        id: makeId("MISSING_CONTENT", [row.rowNumber]),
        type: "MISSING_CONTENT",
        severity: "BLOCKER",
        rowNumbers: [row.rowNumber],
        explanation: `La fila ${row.rowNumber} no tiene contenido/formato. No se puede importar ni publicar sin un contenido; escríbelo (ej. "50ML") o excluye la fila.`,
        rows: [toSnapshot(row)],
        original: { contenido: row.originalContenido },
        options: [
          { id: "EDIT_CONTENT", label: "Escribir contenido" },
          { id: "EXCLUDE_FIRST", label: `Excluir fila ${row.rowNumber} de esta importación` }
        ]
      });
    } else if (!isStandardVolumeContent(row.originalContenido)) {
      findings.push({
        id: makeId("INVALID_CONTENT", [row.rowNumber]),
        type: "INVALID_CONTENT",
        severity: "WARNING",
        rowNumbers: [row.rowNumber],
        explanation: `La fila ${row.rowNumber} tiene un contenido ("${row.originalContenido}") que no se reconoce como un volumen estándar (ej. 50ML, 100ML). Confirma si es un formato especial (set, estuche, tester...) o corrígelo.`,
        rows: [toSnapshot(row)],
        original: { contenido: row.originalContenido },
        options: [
          { id: "ACCEPT_SPECIAL_FORMAT", label: `Aceptar "${row.contenido}" como formato especial` },
          { id: "EDIT_CONTENT", label: "Editar contenido" },
          { id: "IGNORE_WARNING", label: "Ignorar advertencia" }
        ]
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 1. Normalizaciones seguras
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  marca: "marca",
  nombre: "nombre",
  contenido: "contenido",
  costo: "costo"
};

export function detectSafeNormalizations(rows: NormalizedRow[]): QualityFinding[] {
  const findings: QualityFinding[] = [];

  for (const row of rows) {
    if (row.safeChanges.length === 0) continue;

    const original: Record<string, string | number | null> = {};
    const suggested: Record<string, string | number | null> = {};
    for (const field of row.safeChanges) {
      if (field === "marca") {
        original.marca = row.originalMarca;
        suggested.marca = row.marca;
      } else if (field === "nombre") {
        original.nombre = row.originalNombre;
        suggested.nombre = row.nombre;
      } else if (field === "contenido") {
        original.contenido = row.originalContenido;
        suggested.contenido = row.contenido;
      } else if (field === "costo") {
        original.costo = row.originalCosto;
        suggested.costo = row.costo;
      }
    }

    findings.push({
      id: makeId("SAFE_NORMALIZATION", [row.rowNumber]),
      type: "SAFE_NORMALIZATION",
      severity: "INFO",
      rowNumbers: [row.rowNumber],
      explanation: `Se ajustaron automáticamente ${row.safeChanges
        .map((f) => FIELD_LABELS[f])
        .join(", ")} sin cambiar el significado comercial.`,
      rows: [toSnapshot(row)],
      original,
      suggested,
      options: []
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 2. Duplicado exacto
// ---------------------------------------------------------------------------

function identityKey(row: NormalizedRow): string {
  return buildReconciliationKey(row.marca, row.nombre, row.contenido);
}

export function detectExactDuplicates(rows: NormalizedRow[]): { findings: QualityFinding[]; involvedRows: Set<number> } {
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const key = identityKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const findings: QualityFinding[] = [];
  const involvedRows = new Set<number>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    for (const row of group) involvedRows.add(row.rowNumber);

    const [first, second] = group;
    const costsDiffer = group.some((r) => r.costo !== first.costo);
    const rowNumbers = group.map((r) => r.rowNumber);

    const options: QualityFindingOption[] = [
      { id: "KEEP_FIRST", label: `Conservar fila ${first.rowNumber}` },
      { id: "KEEP_SECOND", label: `Conservar fila ${second.rowNumber}` },
      { id: "EXCLUDE_FIRST", label: `Excluir fila ${first.rowNumber} de esta importación` },
      { id: "EXCLUDE_SECOND", label: `Excluir fila ${second.rowNumber} de esta importación` },
      { id: "KEEP_SEPARATE", label: "Mantener separadas (indicar nombres finales distintos)" }
    ];

    findings.push({
      id: makeId("EXACT_DUPLICATE", rowNumbers),
      type: "EXACT_DUPLICATE",
      severity: "BLOCKER",
      rowNumbers,
      explanation: costsDiffer
        ? `Filas ${rowNumbers.join(" y ")} representan el mismo producto (misma marca, nombre y contenido) con costos distintos: ${group
            .map((r) => formatMoney(r.costo))
            .join(" vs ")}. Debes elegir cuál conservar.`
        : `Filas ${rowNumbers.join(" y ")} representan exactamente el mismo producto (misma marca, nombre y contenido).`,
      rows: group.map(toSnapshot),
      options
    });
  }

  return { findings, involvedRows };
}

// ---------------------------------------------------------------------------
// 3. Variantes por contenido (INFO, nunca bloquean)
// ---------------------------------------------------------------------------

function nameIdentityKey(row: NormalizedRow): string {
  return `${normalizeMatchKey(row.marca)}|${normalizeMatchKey(row.nombre)}`;
}

export function detectVariants(rows: NormalizedRow[], excluded: Set<number>): QualityFinding[] {
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    if (excluded.has(row.rowNumber)) continue;
    const key = nameIdentityKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const findings: QualityFinding[] = [];
  for (const group of groups.values()) {
    const distinctContenidos = new Set(group.map((r) => r.contenido));
    if (group.length < 2 || distinctContenidos.size < 2) continue;

    const rowNumbers = group.map((r) => r.rowNumber);
    findings.push({
      id: makeId("VARIANT", rowNumbers),
      type: "VARIANT",
      severity: "INFO",
      rowNumbers,
      explanation: `Mismo perfume en diferentes contenidos (${[...distinctContenidos].join(
        ", "
      )}). Se importarán por separado, cada uno con su propio SKU, costo y stock.`,
      rows: group.map(toSnapshot),
      options: []
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 4/5. Posibles duplicados e incoherencias de nombre (dentro del archivo)
// ---------------------------------------------------------------------------

const HIGH_SIMILARITY_THRESHOLD = 0.7;
const MEDIUM_SIMILARITY_THRESHOLD = 0.45;

export function detectPossibleDuplicatesAndNameIssues(
  rows: NormalizedRow[],
  excluded: Set<number>
): QualityFinding[] {
  const candidateRows = rows.filter((r) => !excluded.has(r.rowNumber));

  // Bucket por (marca, contenido) normalizados: solo se comparan nombres
  // dentro del mismo contenido y marca (regla explicita de la fase).
  const buckets = new Map<string, NormalizedRow[]>();
  for (const row of candidateRows) {
    const key = `${normalizeMatchKey(row.marca)}|${row.contenido}`;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const findings: QualityFinding[] = [];
  const pairedRowNumbers = new Set<number>();

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;

    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        if (nameIdentityKey(a) === nameIdentityKey(b)) continue; // ya cubierto por VARIANT/EXACT_DUPLICATE

        const keyA = buildCandidateNameKey(a.nombre, a.marca);
        const keyB = buildCandidateNameKey(b.nombre, b.marca);
        if (keyA === "" || keyB === "") continue;

        const similarity = nameSimilarity(keyA, keyB);
        if (similarity < MEDIUM_SIMILARITY_THRESHOLD) continue;

        const rowNumbers = [a.rowNumber, b.rowNumber];
        pairedRowNumbers.add(a.rowNumber);
        pairedRowNumbers.add(b.rowNumber);

        if (similarity >= HIGH_SIMILARITY_THRESHOLD) {
          const concentrationOnly = isConcentrationOnlyDifference(a.nombre, b.nombre);
          findings.push({
            id: makeId("POSSIBLE_DUPLICATE", rowNumbers),
            type: "POSSIBLE_DUPLICATE",
            severity: similarity >= 0.95 && !concentrationOnly ? "BLOCKER" : "WARNING",
            rowNumbers,
            explanation: `Filas ${a.rowNumber} y ${b.rowNumber} tienen la misma marca y contenido, y nombres muy parecidos ("${a.nombre}" / "${b.nombre}"). Podrían ser el mismo producto.`,
            rows: [toSnapshot(a), toSnapshot(b)],
            suggested: { similitud: Math.round(similarity * 100) },
            options: [
              { id: "UNIFY_UNDER_FIRST", label: `Unificar bajo "${a.nombre}"` },
              { id: "UNIFY_UNDER_SECOND", label: `Unificar bajo "${b.nombre}"` },
              { id: "SET_CANONICAL_NAME", label: "Escribir nombre canónico" },
              { id: "KEEP_SEPARATE", label: "Mantener separados" },
              { id: "EXCLUDE_FIRST", label: `Excluir fila ${a.rowNumber}` },
              { id: "EXCLUDE_SECOND", label: `Excluir fila ${b.rowNumber}` },
              { id: "IGNORE_WARNING", label: "Ignorar advertencia" }
            ]
          });
        } else {
          findings.push({
            id: makeId("NAME_INCONSISTENCY", rowNumbers),
            type: "NAME_INCONSISTENCY",
            severity: "WARNING",
            rowNumbers,
            explanation: `Filas ${a.rowNumber} y ${b.rowNumber} comparten marca y contenido con nombres parecidos pero no idénticos ("${a.nombre}" / "${b.nombre}"). Posible inconsistencia, revisa antes de continuar.`,
            rows: [toSnapshot(a), toSnapshot(b)],
            suggested: { similitud: Math.round(similarity * 100) },
            options: [
              { id: "USE_SUGGESTED_NAME", label: `Usar "${a.nombre}" para ambas` },
              { id: "EDIT_NAME", label: "Editar nombre" },
              { id: "KEEP_SEPARATE", label: "Mantener original" },
              { id: "IGNORE_WARNING", label: "Ignorar advertencia" }
            ]
          });
        }
      }
    }
  }

  // Typos de descriptor conocidos (parfm -> parfum, toilete -> toilette), en
  // filas que no ya fueron emparejadas arriba, sin necesidad de una fila
  // candidata: comparacion contra un vocabulario local cerrado, no un
  // diccionario remoto.
  for (const row of candidateRows) {
    if (pairedRowNumbers.has(row.rowNumber)) continue;
    const typo = findNearDescriptorTypo(row.nombre);
    if (!typo) continue;

    findings.push({
      id: makeId("NAME_INCONSISTENCY", [row.rowNumber, typo.original]),
      type: "NAME_INCONSISTENCY",
      severity: "WARNING",
      rowNumbers: [row.rowNumber],
      explanation: `Fila ${row.rowNumber}: "${row.nombre}" contiene "${typo.original}", muy parecido al descriptor conocido "${typo.suggested}". Posible inconsistencia, no se corrige automáticamente.`,
      rows: [toSnapshot(row)],
      suggested: { nombre: row.nombre.replace(new RegExp(typo.original, "i"), typo.suggested) },
      options: [
        { id: "USE_SUGGESTED_NAME", label: "Usar sugerencia" },
        { id: "EDIT_NAME", label: "Editar nombre" },
        { id: "KEEP_SEPARATE", label: "Mantener original" }
      ]
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 6. Incoherencias de marca
// ---------------------------------------------------------------------------

const BRAND_SIMILARITY_THRESHOLD = 0.75;

export function detectBrandInconsistencies(rows: NormalizedRow[]): QualityFinding[] {
  const byNormalized = new Map<string, { display: string; rowNumbers: number[] }>();
  for (const row of rows) {
    const key = normalizeMatchKey(row.marca);
    if (key === "") continue;
    const entry = byNormalized.get(key);
    if (entry) {
      entry.rowNumbers.push(row.rowNumber);
    } else {
      byNormalized.set(key, { display: row.marca, rowNumbers: [row.rowNumber] });
    }
  }

  const variants = [...byNormalized.entries()];
  const findings: QualityFinding[] = [];
  const alreadyPaired = new Set<string>();

  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const [keyA, entryA] = variants[i];
      const [keyB, entryB] = variants[j];
      if (alreadyPaired.has(keyA) || alreadyPaired.has(keyB)) continue;

      const similarity = levenshteinSimilarity(keyA, keyB);
      if (similarity < BRAND_SIMILARITY_THRESHOLD) continue;

      alreadyPaired.add(keyA);
      alreadyPaired.add(keyB);

      const [suggested, other] =
        entryA.rowNumbers.length >= entryB.rowNumbers.length ? [entryA, entryB] : [entryB, entryA];
      const rowNumbers = [...entryA.rowNumbers, ...entryB.rowNumbers].sort((a, b) => a - b);

      findings.push({
        id: makeId("BRAND_INCONSISTENCY", [keyA, keyB]),
        type: "BRAND_INCONSISTENCY",
        severity: "WARNING",
        rowNumbers,
        explanation: `Se detectaron dos formas de escribir la misma marca en el archivo: "${entryA.display}" y "${entryB.display}". Elige una forma final.`,
        rows: rowNumbers.map((rn) => toSnapshot(rows.find((r) => r.rowNumber === rn)!)),
        original: { marca_a: entryA.display, marca_b: entryB.display },
        suggested: { marca: suggested.display },
        options: [
          { id: "USE_SUGGESTED_BRAND", label: `Usar "${suggested.display}"` },
          { id: "USE_ALTERNATE_BRAND", label: `Usar "${other.display}"` },
          { id: "SET_BRAND_MANUAL", label: "Escribir marca manualmente" },
          { id: "KEEP_SEPARATE", label: "Mantener como está" }
        ]
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 7. Cotejo con catalogo existente
// ---------------------------------------------------------------------------

export function detectExistingCatalogMatches(
  rows: NormalizedRow[],
  existingProducts: ExistingProductForReview[]
): QualityFinding[] {
  const existingBySku = new Map(existingProducts.map((p) => [p.sku, p]));
  const findings: QualityFinding[] = [];

  for (const row of rows) {
    const generatedSku = buildSkuBase(row.marca, row.nombre, row.contenido);
    if (existingBySku.has(generatedSku)) continue; // match directo por SKU: ruta normal de ACTUALIZAR, sin decision

    const rowKey = identityKey(row);
    let bestMatch: { product: ExistingProductForReview; similarity: number; exact: boolean } | null = null;

    for (const product of existingProducts) {
      const productKey = buildReconciliationKey(product.marca, product.nombre, product.contenido);
      if (productKey === rowKey) {
        bestMatch = { product, similarity: 1, exact: true };
        break;
      }

      if (
        normalizeMatchKey(product.marca) === normalizeMatchKey(row.marca) &&
        normalizeContenido(product.contenido) === row.contenido
      ) {
        const similarity = nameSimilarity(
          buildCandidateNameKey(product.nombre, product.marca),
          buildCandidateNameKey(row.nombre, row.marca)
        );
        if (similarity >= 0.55 && (!bestMatch || similarity > bestMatch.similarity)) {
          bestMatch = { product, similarity, exact: false };
        }
      }
    }

    if (!bestMatch) continue;

    findings.push({
      id: makeId("EXISTING_CATALOG_MATCH", [row.rowNumber, bestMatch.product.productId]),
      type: "EXISTING_CATALOG_MATCH",
      severity: "WARNING",
      rowNumbers: [row.rowNumber],
      existingProductId: bestMatch.product.productId,
      explanation: bestMatch.exact
        ? `La fila ${row.rowNumber} coincide exactamente con un producto existente (SKU histórico "${bestMatch.product.sku}" en vez de "${generatedSku}"). ¿Es el mismo producto?`
        : `La fila ${row.rowNumber} se parece a un producto existente ("${bestMatch.product.nombre}", SKU ${bestMatch.product.sku}). ¿Es el mismo producto?`,
      rows: [toSnapshot(row)],
      existing: bestMatch.product,
      options: [
        { id: "UPDATE_EXISTING", label: "Actualizar este producto existente" },
        { id: "CREATE_SEPARATE", label: "Crear como producto separado" },
        { id: "EDIT_NAME", label: "Editar nombre/contenido" },
        { id: "EXCLUDE_FIRST", label: `Excluir fila ${row.rowNumber} de esta importación` }
      ]
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 8. Advertencias de costo
// ---------------------------------------------------------------------------

const COST_VARIATION_THRESHOLD = 0.2;

export function detectPriceAnomalies(
  rows: NormalizedRow[],
  existingProducts: ExistingProductForReview[],
  existingMatchFindings: QualityFinding[]
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const existingBySku = new Map(existingProducts.map((p) => [p.sku, p]));
  const explicitMatchByRow = new Map<number, ExistingProductForReview>();
  for (const finding of existingMatchFindings) {
    if (finding.existing) explicitMatchByRow.set(finding.rowNumbers[0], finding.existing);
  }

  for (const row of rows) {
    if (!Number.isFinite(row.costo) || row.costo <= 0) {
      findings.push({
        id: makeId("PRICE_ANOMALY", [row.rowNumber, "invalido"]),
        type: "PRICE_ANOMALY",
        severity: "BLOCKER",
        rowNumbers: [row.rowNumber],
        explanation: `La fila ${row.rowNumber} tiene un costo inválido o igual a cero. No se puede importar sin corregirlo.`,
        rows: [toSnapshot(row)],
        options: [
          { id: "EDIT_COST", label: "Editar costo" },
          { id: "EXCLUDE_FIRST", label: `Excluir fila ${row.rowNumber}` }
        ]
      });
      continue;
    }

    const generatedSku = buildSkuBase(row.marca, row.nombre, row.contenido);
    const existing = existingBySku.get(generatedSku) ?? explicitMatchByRow.get(row.rowNumber);
    if (!existing || existing.costoUnitario <= 0) continue;

    const diff = row.costo - existing.costoUnitario;
    const percent = Math.abs(diff) / existing.costoUnitario;
    if (percent < COST_VARIATION_THRESHOLD) continue;

    findings.push({
      id: makeId("PRICE_ANOMALY", [row.rowNumber, existing.productId]),
      type: "PRICE_ANOMALY",
      severity: "WARNING",
      rowNumbers: [row.rowNumber],
      existingProductId: existing.productId,
      explanation: `La fila ${row.rowNumber} cambia el costo de "${existing.nombre}" de ${formatMoney(
        existing.costoUnitario
      )} a ${formatMoney(row.costo)} (${diff >= 0 ? "+" : ""}${Math.round(percent * 100)}%).`,
      rows: [toSnapshot(row)],
      existing,
      original: { costoAnterior: existing.costoUnitario },
      suggested: { costoNuevo: row.costo, diferencia: diff, diferenciaPorcentual: Math.round(percent * 100) },
      options: [
        { id: "ACCEPT_NEW_COST", label: "Aceptar costo nuevo" },
        { id: "KEEP_EXISTING_COST", label: "Mantener costo existente" },
        { id: "EDIT_COST", label: "Editar costo" },
        { id: "EXCLUDE_FIRST", label: `Excluir fila ${row.rowNumber}` },
        { id: "IGNORE_WARNING", label: "Ignorar advertencia" }
      ]
    });
  }

  // Variante de menor contenido mas cara que una de mayor contenido: advertencia
  // comercial, nunca bloqueante (puede ser correcto).
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const key = nameIdentityKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const withVolume = group
      .map((row) => ({ row, volume: parseFloat(row.contenido) }))
      .filter((entry) => Number.isFinite(entry.volume));
    withVolume.sort((a, b) => a.volume - b.volume);

    for (let i = 0; i < withVolume.length - 1; i += 1) {
      const smaller = withVolume[i];
      const larger = withVolume[i + 1];
      if (smaller.volume === larger.volume) continue;
      if (smaller.row.costo <= larger.row.costo) continue;

      findings.push({
        id: makeId("PRICE_ANOMALY", [smaller.row.rowNumber, larger.row.rowNumber, "volumen"]),
        type: "PRICE_ANOMALY",
        severity: "WARNING",
        rowNumbers: [smaller.row.rowNumber, larger.row.rowNumber],
        explanation: `La presentación de ${smaller.row.contenido} (fila ${smaller.row.rowNumber}, ${formatMoney(
          smaller.row.costo
        )}) cuesta más que la de ${larger.row.contenido} (fila ${larger.row.rowNumber}, ${formatMoney(
          larger.row.costo
        )}). Puede ser correcto; se deja como advertencia comercial.`,
        rows: [toSnapshot(smaller.row), toSnapshot(larger.row)],
        options: [
          { id: "ACCEPT_NEW_COST", label: "Aceptar ambos costos tal como están" },
          { id: "EDIT_COST", label: "Editar costo" },
          { id: "IGNORE_WARNING", label: "Ignorar advertencia" }
        ]
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------

export type QualityReviewSummary = {
  filasFisicas: number;
  filasVacias: number;
  filasUtiles: number;
  normalizacionesSeguras: number;
  variantesDetectadas: number;
  posiblesDuplicados: number;
  coincidenciasCatalogoExistente: number;
  incoherenciasNombreOMarca: number;
  advertenciasCosto: number;
  /** Filas con nombre/marca/contenido faltante o contenido no estandar (Fase 2B.13). */
  datosIncompletos: number;
  conflictosPendientes: number;
};

export type QualityReviewResult = {
  findings: QualityFinding[];
  summary: QualityReviewSummary;
  normalizedRows: NormalizedRow[];
};

export function runQualityReview(
  rows: SupplierImportRow[],
  existingProducts: ExistingProductForReview[],
  fileStats: { filasFisicas: number; filasVacias: number }
): QualityReviewResult {
  const normalizedRows = buildNormalizedRows(rows);

  const missingOrInvalidFields = detectMissingOrInvalidFields(normalizedRows);
  const safeNormalizations = detectSafeNormalizations(normalizedRows);
  const { findings: exactDuplicates, involvedRows } = detectExactDuplicates(normalizedRows);
  const variants = detectVariants(normalizedRows, involvedRows);
  const possibleDuplicatesAndNames = detectPossibleDuplicatesAndNameIssues(normalizedRows, involvedRows);
  const brandInconsistencies = detectBrandInconsistencies(normalizedRows);
  const existingMatches = detectExistingCatalogMatches(normalizedRows, existingProducts);
  const priceAnomalies = detectPriceAnomalies(normalizedRows, existingProducts, existingMatches);

  const findings = [
    ...missingOrInvalidFields,
    ...exactDuplicates,
    ...possibleDuplicatesAndNames.filter((f) => f.type === "POSSIBLE_DUPLICATE"),
    ...priceAnomalies,
    ...brandInconsistencies,
    ...possibleDuplicatesAndNames.filter((f) => f.type === "NAME_INCONSISTENCY"),
    ...existingMatches,
    ...variants,
    ...safeNormalizations
  ];

  const conflictosPendientes = findings.filter((f) => f.severity === "BLOCKER").length;

  const summary: QualityReviewSummary = {
    filasFisicas: fileStats.filasFisicas,
    filasVacias: fileStats.filasVacias,
    filasUtiles: rows.length,
    normalizacionesSeguras: safeNormalizations.length,
    variantesDetectadas: variants.reduce((acc, f) => acc + f.rowNumbers.length, 0),
    posiblesDuplicados: exactDuplicates.length + possibleDuplicatesAndNames.filter((f) => f.type === "POSSIBLE_DUPLICATE").length,
    coincidenciasCatalogoExistente: existingMatches.length,
    incoherenciasNombreOMarca:
      brandInconsistencies.length + possibleDuplicatesAndNames.filter((f) => f.type === "NAME_INCONSISTENCY").length,
    advertenciasCosto: priceAnomalies.length,
    datosIncompletos: missingOrInvalidFields.length,
    conflictosPendientes
  };

  return { findings, summary, normalizedRows };
}

// ---------------------------------------------------------------------------
// Aplicacion de decisiones -> plan final (SKU regenerado al final)
// ---------------------------------------------------------------------------

/** Correccion de un campo obligatorio aplicada durante la revision guiada (para el resumen final "antes/despues"). */
export type FieldCorrection = {
  field: "nombre" | "marca" | "contenido";
  before: string;
  after: string;
};

export type FinalPlanRow = {
  rowNumbers: number[];
  sku: string;
  nombre: string;
  marca: string;
  contenido: string;
  costoUnitario: number;
  precioVentaSugerido: number;
  precioVentaFinal: number;
  modoPrecio: SupplierModoPrecio;
  action: "CREAR" | "ACTUALIZAR";
  targetProductId?: string;
  /** Presente solo si esta fila tenia nombre/marca/contenido faltante o invalido y se corrigio durante la revision. */
  corrections?: FieldCorrection[];
};

export type ApplyDecisionsResult = {
  plan: FinalPlanRow[];
  unresolvedBlockers: QualityFinding[];
  errors: string[];
};

/**
 * Aplica las decisiones humanas sobre los hallazgos y produce el plan final.
 * SIEMPRE se recalcula desde `rows` (crudo) + `findings` (recalculado por el
 * servidor) + `decisions` (recibidas, nunca precomputadas). El SKU se asigna
 * al final, despues de resolver exclusiones y unificaciones.
 */
export function applyQualityDecisions(
  rows: SupplierImportRow[],
  findings: QualityFinding[],
  decisions: QualityDecision[],
  existingProducts: ExistingProductForReview[],
  markupPercentage: number
): ApplyDecisionsResult {
  const errors: string[] = [];
  const decisionByFindingId = new Map(decisions.map((d) => [d.findingId, d]));
  const normalizedRows = buildNormalizedRows(rows);
  const byRowNumber = new Map(normalizedRows.map((r) => [r.rowNumber, r]));

  const excludedRows = new Set<number>();
  const nameOverrides = new Map<number, string>();
  const brandOverrides = new Map<number, string>();
  const contentOverrides = new Map<number, string>();
  const costOverrides = new Map<number, number>();
  const productBindings = new Map<number, string>();
  /** Fila sobreviviente -> todas las filas originales que fusiono (para auditoria en el resumen final). */
  const unionOrigins = new Map<number, number[]>();
  /** Fila -> correcciones de campos obligatorios aplicadas (para el "antes/despues" del resumen final, seccion 11). */
  const fieldCorrections = new Map<number, FieldCorrection[]>();

  function recordCorrection(rowNumber: number, field: FieldCorrection["field"], before: string, after: string) {
    const list = fieldCorrections.get(rowNumber) ?? [];
    list.push({ field, before, after });
    fieldCorrections.set(rowNumber, list);
  }

  const unresolvedBlockers: QualityFinding[] = [];

  for (const finding of findings) {
    const decision = decisionByFindingId.get(finding.id);

    if (finding.type === "MISSING_NAME") {
      if (!decision) {
        unresolvedBlockers.push(finding);
        continue;
      }
      if (decision.optionId === "EXCLUDE_FIRST") {
        excludedRows.add(finding.rowNumbers[0]);
      } else if (decision.optionId === "EDIT_NAME" && decision.textValue && decision.textValue.trim() !== "") {
        const rn = finding.rowNumbers[0];
        nameOverrides.set(rn, decision.textValue.trim());
        recordCorrection(rn, "nombre", "", decision.textValue.trim());
      } else {
        unresolvedBlockers.push(finding);
      }
      continue;
    }

    if (finding.type === "MISSING_BRAND") {
      if (!decision) {
        unresolvedBlockers.push(finding);
        continue;
      }
      if (decision.optionId === "EXCLUDE_FIRST") {
        excludedRows.add(finding.rowNumbers[0]);
      } else if (decision.optionId === "SET_BRAND_MANUAL" && decision.textValue && decision.textValue.trim() !== "") {
        const rn = finding.rowNumbers[0];
        brandOverrides.set(rn, decision.textValue.trim());
        recordCorrection(rn, "marca", "", decision.textValue.trim());
      } else {
        unresolvedBlockers.push(finding);
      }
      continue;
    }

    if (finding.type === "MISSING_CONTENT") {
      if (!decision) {
        unresolvedBlockers.push(finding);
        continue;
      }
      if (decision.optionId === "EXCLUDE_FIRST") {
        excludedRows.add(finding.rowNumbers[0]);
      } else if (decision.optionId === "EDIT_CONTENT" && decision.textValue && decision.textValue.trim() !== "") {
        const rn = finding.rowNumbers[0];
        const normalized = normalizeContenido(decision.textValue.trim());
        contentOverrides.set(rn, normalized);
        recordCorrection(rn, "contenido", "", normalized);
      } else {
        unresolvedBlockers.push(finding);
      }
      continue;
    }

    if (finding.type === "EXACT_DUPLICATE") {
      if (!decision) {
        unresolvedBlockers.push(finding);
        continue;
      }
      const [firstRow, secondRow] = finding.rowNumbers;
      if (decision.optionId === "KEEP_FIRST") {
        finding.rowNumbers.filter((rn) => rn !== firstRow).forEach((rn) => excludedRows.add(rn));
      } else if (decision.optionId === "KEEP_SECOND") {
        finding.rowNumbers.filter((rn) => rn !== secondRow).forEach((rn) => excludedRows.add(rn));
      } else if (decision.optionId === "EXCLUDE_FIRST") {
        excludedRows.add(firstRow);
      } else if (decision.optionId === "EXCLUDE_SECOND") {
        excludedRows.add(secondRow);
      } else if (decision.optionId === "KEEP_SEPARATE") {
        // Requiere un nombre final distinto para al menos una de las dos
        // filas; se acepta como renombre de la segunda fila y se revalida
        // despues de aplicar todo (ver chequeo de "stillDuplicated" abajo).
        if (decision.textValue) {
          nameOverrides.set(secondRow, decision.textValue);
        }
      } else {
        errors.push(`Decisión inválida para el hallazgo ${finding.id}.`);
        unresolvedBlockers.push(finding);
      }
      continue;
    }

    if (finding.type === "PRICE_ANOMALY" && finding.severity === "BLOCKER") {
      if (!decision) {
        unresolvedBlockers.push(finding);
        continue;
      }
      if (decision.optionId === "EXCLUDE_FIRST") {
        excludedRows.add(finding.rowNumbers[0]);
      } else if (decision.optionId === "EDIT_COST" && typeof decision.numberValue === "number" && decision.numberValue > 0) {
        costOverrides.set(finding.rowNumbers[0], Math.round(decision.numberValue));
      } else {
        unresolvedBlockers.push(finding);
      }
      continue;
    }

    if (finding.type === "POSSIBLE_DUPLICATE" && finding.severity === "BLOCKER") {
      if (!decision) {
        unresolvedBlockers.push(finding);
        continue;
      }
      applyPairDecision(finding, decision);
      continue;
    }

    // Hallazgos WARNING/INFO: aplicar si hay decision, pero nunca bloquean.
    if (decision) {
      if (finding.type === "POSSIBLE_DUPLICATE") {
        applyPairDecision(finding, decision);
      } else if (finding.type === "PRICE_ANOMALY") {
        if (decision.optionId === "EDIT_COST" && typeof decision.numberValue === "number" && decision.numberValue > 0) {
          costOverrides.set(finding.rowNumbers[0], Math.round(decision.numberValue));
        } else if (decision.optionId === "KEEP_EXISTING_COST" && finding.existing) {
          costOverrides.set(finding.rowNumbers[0], finding.existing.costoUnitario);
        } else if (decision.optionId === "EXCLUDE_FIRST") {
          excludedRows.add(finding.rowNumbers[0]);
        }
      } else if (finding.type === "BRAND_INCONSISTENCY") {
        let finalBrand: string | null = null;
        if (decision.optionId === "USE_SUGGESTED_BRAND" && finding.suggested?.marca) {
          finalBrand = String(finding.suggested.marca);
        } else if (decision.optionId === "USE_ALTERNATE_BRAND" && finding.original) {
          const suggestedValue = finding.suggested?.marca;
          const a = finding.original.marca_a;
          const b = finding.original.marca_b;
          finalBrand = String(a === suggestedValue ? b : a);
        } else if (decision.optionId === "SET_BRAND_MANUAL" && decision.textValue) {
          finalBrand = decision.textValue;
        }
        if (finalBrand) {
          const targets = decision.applyToAllInFile
            ? finding.rowNumbers
            : finding.rowNumbers.filter((rn) => finding.rows.find((r) => r.rowNumber === rn));
          for (const rn of targets) brandOverrides.set(rn, finalBrand);
        }
      } else if (finding.type === "NAME_INCONSISTENCY") {
        if (decision.optionId === "USE_SUGGESTED_NAME" && finding.suggested?.nombre) {
          for (const rn of finding.rowNumbers) nameOverrides.set(rn, String(finding.suggested.nombre));
        } else if (decision.optionId === "EDIT_NAME" && decision.textValue) {
          for (const rn of finding.rowNumbers) nameOverrides.set(rn, decision.textValue!);
        } else if (decision.optionId === "EXCLUDE_FIRST") {
          excludedRows.add(finding.rowNumbers[0]);
        }
      } else if (finding.type === "EXISTING_CATALOG_MATCH") {
        if (decision.optionId === "UPDATE_EXISTING" && finding.existingProductId) {
          productBindings.set(finding.rowNumbers[0], finding.existingProductId);
        } else if (decision.optionId === "EDIT_NAME" && decision.textValue) {
          nameOverrides.set(finding.rowNumbers[0], decision.textValue);
        } else if (decision.optionId === "EXCLUDE_FIRST") {
          excludedRows.add(finding.rowNumbers[0]);
        }
      } else if (finding.type === "INVALID_CONTENT") {
        // ACCEPT_SPECIAL_FORMAT / IGNORE_WARNING: nunca bloquean, no requieren
        // override (el contenido normalizado ya quedo como texto tal cual).
        if (decision.optionId === "EDIT_CONTENT" && decision.textValue && decision.textValue.trim() !== "") {
          const rn = finding.rowNumbers[0];
          const before = byRowNumber.get(rn)?.contenido ?? "";
          const normalized = normalizeContenido(decision.textValue.trim());
          contentOverrides.set(rn, normalized);
          recordCorrection(rn, "contenido", before, normalized);
        }
      }
    }
  }

  function applyPairDecision(finding: QualityFinding, decision: QualityDecision) {
    const [rowA, rowB] = finding.rowNumbers;
    if (decision.optionId === "EXCLUDE_FIRST") {
      excludedRows.add(rowA);
    } else if (decision.optionId === "EXCLUDE_SECOND") {
      excludedRows.add(rowB);
    } else if (decision.optionId === "KEEP_SEPARATE" || decision.optionId === "IGNORE_WARNING") {
      // No se toca nada: quedan como filas independientes.
    } else if (
      decision.optionId === "UNIFY_UNDER_FIRST" ||
      decision.optionId === "UNIFY_UNDER_SECOND" ||
      decision.optionId === "SET_CANONICAL_NAME"
    ) {
      if (!decision.costFromRow || (decision.costFromRow !== rowA && decision.costFromRow !== rowB)) {
        errors.push(`El hallazgo ${finding.id} requiere indicar qué costo conservar al unificar.`);
        unresolvedBlockers.push(finding);
        return;
      }
      const canonicalName =
        decision.optionId === "SET_CANONICAL_NAME"
          ? decision.textValue ?? null
          : decision.optionId === "UNIFY_UNDER_FIRST"
            ? byRowNumber.get(rowA)?.nombre ?? null
            : byRowNumber.get(rowB)?.nombre ?? null;

      if (!canonicalName) {
        errors.push(`El hallazgo ${finding.id} requiere un nombre canónico.`);
        unresolvedBlockers.push(finding);
        return;
      }

      unionOrigins.set(rowA, [rowA, rowB]);
      nameOverrides.set(rowA, canonicalName);
      nameOverrides.set(rowB, canonicalName);
      costOverrides.set(rowA, decision.costFromRow === rowA ? (byRowNumber.get(rowA)?.costo ?? 0) : (byRowNumber.get(rowB)?.costo ?? 0));
      costOverrides.set(rowB, decision.costFromRow === rowA ? (byRowNumber.get(rowA)?.costo ?? 0) : (byRowNumber.get(rowB)?.costo ?? 0));
      // La segunda fila del grupo se excluye; solo sobrevive rowA como representante.
      excludedRows.add(rowB);
    } else {
      errors.push(`Decisión inválida para el hallazgo ${finding.id}.`);
      unresolvedBlockers.push(finding);
    }
  }

  if (unresolvedBlockers.length > 0) {
    return { plan: [], unresolvedBlockers, errors };
  }

  // Construir filas finales sobrevivientes con overrides aplicados.
  const survivingRows = normalizedRows
    .filter((r) => !excludedRows.has(r.rowNumber))
    .map((r) => ({
      rowNumber: r.rowNumber,
      marca: brandOverrides.get(r.rowNumber) ?? r.marca,
      nombre: nameOverrides.get(r.rowNumber) ?? r.nombre,
      contenido: contentOverrides.get(r.rowNumber) ?? r.contenido,
      costo: costOverrides.get(r.rowNumber) ?? r.costo,
      targetProductId: productBindings.get(r.rowNumber)
    }));

  // Revalidar EXACT_DUPLICATE "KEEP_SEPARATE": si tras los overrides la
  // identidad sigue siendo igual, el conflicto no quedo resuelto.
  const stillDuplicated = new Map<string, number[]>();
  for (const row of survivingRows) {
    const key = buildReconciliationKey(row.marca, row.nombre, row.contenido);
    const list = stillDuplicated.get(key) ?? [];
    list.push(row.rowNumber);
    stillDuplicated.set(key, list);
  }
  for (const finding of findings) {
    if (finding.type !== "EXACT_DUPLICATE") continue;
    const decision = decisionByFindingId.get(finding.id);
    if (decision?.optionId !== "KEEP_SEPARATE") continue;
    const survivors = finding.rowNumbers.filter((rn) => !excludedRows.has(rn));
    if (survivors.length < 2) continue;
    const key = buildReconciliationKey(
      survivingRows.find((r) => r.rowNumber === survivors[0])!.marca,
      survivingRows.find((r) => r.rowNumber === survivors[0])!.nombre,
      survivingRows.find((r) => r.rowNumber === survivors[0])!.contenido
    );
    if ((stillDuplicated.get(key)?.length ?? 0) > 1) {
      errors.push(
        `El hallazgo ${finding.id} eligió "mantener separadas" pero los nombres finales siguen siendo idénticos. Edita al menos uno de los nombres.`
      );
      unresolvedBlockers.push(finding);
    }
  }

  if (unresolvedBlockers.length > 0) {
    return { plan: [], unresolvedBlockers, errors };
  }

  // SKU final: se asigna DESPUES de resolver todas las decisiones, nunca antes.
  const existingBySku = new Map(existingProducts.map((p) => [p.sku, p]));
  const existingById = new Map(existingProducts.map((p) => [p.productId, p]));
  const skuMap = assignDeterministicSkus(survivingRows, (r) => ({ marca: r.marca, nombre: r.nombre, contenido: r.contenido }));

  const plan: FinalPlanRow[] = survivingRows.map((row) => {
    const boundProduct = row.targetProductId ? existingById.get(row.targetProductId) : undefined;
    const sku = boundProduct ? boundProduct.sku : skuMap.get(row)!;
    const existing = boundProduct ?? existingBySku.get(sku);
    const precioVentaSugerido = calculateSalePrice(row.costo, markupPercentage);
    const esManualExistente = existing?.modoPrecio === "MANUAL";

    const rowNumbers = unionOrigins.get(row.rowNumber) ?? [row.rowNumber];
    const corrections = rowNumbers.flatMap((rn) => fieldCorrections.get(rn) ?? []);

    return {
      rowNumbers,
      sku,
      nombre: row.nombre,
      marca: row.marca,
      contenido: row.contenido,
      costoUnitario: row.costo,
      precioVentaSugerido,
      precioVentaFinal: esManualExistente ? (existing as ExistingProductForReview).precioVenta : precioVentaSugerido,
      modoPrecio: esManualExistente ? "MANUAL" : "AUTO",
      action: existing ? "ACTUALIZAR" : "CREAR",
      targetProductId: existing?.productId,
      corrections: corrections.length > 0 ? corrections : undefined
    };
  });

  const finalSkus = new Set<string>();
  for (const row of plan) {
    if (finalSkus.has(row.sku)) {
      errors.push(`SKU final duplicado tras aplicar decisiones: ${row.sku}.`);
    }
    finalSkus.add(row.sku);
  }

  return { plan, unresolvedBlockers: [], errors };
}
