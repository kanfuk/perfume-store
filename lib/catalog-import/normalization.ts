/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Normalizacion
 * Descripcion: Normalizacion de texto para claves de coincidencia internas
 * (sin tildes, en minusculas) y para presentacion visible (tildes conservadas).
 */

/** Unifica espacios multiples/tabs en uno solo y recorta bordes. Conserva tildes. */
export function normalizeDisplayText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clave de encabezado: sin tildes, minusculas, SIN espacios ni separadores
 * (espacios, guiones, guion bajo eliminados por completo). Permite que
 * "Precio Compra", "precio_compra", "PrecioCompra" y "precio-compra"
 * matcheen como el mismo encabezado.
 */
export function normalizeHeaderKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Clave interna: sin tildes, minusculas, espacios unificados. Solo para comparar. */
export function normalizeMatchKey(value: string): string {
  return normalizeDisplayText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CONTENT_PATTERN = /(\d+(?:[.,]\d+)?)\s*(ml|ML|Ml|mL)\b/i;

/**
 * Normaliza el contenido a un formato estable "<numero>ML". Contenidos con
 * numeros distintos NUNCA se consideran iguales (30ml != 50ml != 80ml).
 * Si no matchea el patron numero+ml, se retorna la version normalizada de texto
 * (para no fusionar por error valores que no son volumenes reconocibles).
 */
export function normalizeContenido(value: string): string {
  const trimmed = normalizeDisplayText(value);
  const match = trimmed.match(CONTENT_PATTERN);

  if (!match) {
    return normalizeMatchKey(trimmed);
  }

  const numero = match[1].replace(",", ".");
  const numeroLimpio = numero.endsWith(".0") ? numero.slice(0, -2) : numero;
  return `${numeroLimpio}ML`;
}

/**
 * Verdadero solo si el contenido (no vacio) matchea el patron numero+ML
 * reconocido por `normalizeContenido`. Formatos especiales explicitos como
 * "SET", "ESTUCHE", "TESTER", "PACK" o "SIN CAJA" retornan false: no son
 * volumenes, y NO deben convertirse silenciosamente a un numero de ML. Se
 * usa exclusivamente para clasificar INVALID_CONTENT en el asistente de
 * calidad (Fase 2B.13); nunca cambia el contrato de `normalizeContenido`.
 */
export function isStandardVolumeContent(value: string): boolean {
  const trimmed = normalizeDisplayText(value);
  if (trimmed === "") return false;
  return CONTENT_PATTERN.test(trimmed);
}

export function buildReconciliationKey(marca: string, nombre: string, contenido: string): string {
  return [normalizeMatchKey(marca), normalizeMatchKey(nombre), normalizeContenido(contenido)].join("|");
}

/** Distancia de Levenshtein clasica, usada solo para SUGERIR candidatos dudosos. */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = new Array(n + 1);
  let currRow = new Array(n + 1);

  for (let j = 0; j <= n; j += 1) prevRow[j] = j;

  for (let i = 1; i <= m; i += 1) {
    currRow[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n];
}

/**
 * Heuristica de similitud "casi igual" para sugerir (no confirmar) posibles
 * variantes tipograficas del mismo nombre: distancia absoluta pequena o
 * relativa a la longitud del texto mas largo.
 */
export function isLikelyTypoVariant(a: string, b: string): boolean {
  if (a === b) return false;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return false;
  const relative = distance / maxLen;
  return distance <= 2 || relative <= 0.2;
}

/**
 * Detecta dos nombres normalizados que comparten exactamente todos sus
 * tokens salvo el ultimo (ej. "212 heroes forever young" vs
 * "212 heroes forever mujer"): mismo numero de tokens, mismo prefijo, solo
 * difiere la ultima palabra descriptiva. Se usa unicamente para SUGERIR un
 * candidato de revision manual, nunca para fusionar automaticamente.
 */
export function differsOnlyInLastToken(a: string, b: string): boolean {
  if (a === b) return false;
  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  // Se exigen al menos 2 tokens compartidos antes del ultimo para evitar
  // falsos positivos entre lineas de producto distintas que solo comparten
  // una palabra generica (ej. "Polo Blue" vs "Polo EST.67").
  if (tokensA.length < 3 || tokensA.length !== tokensB.length) return false;
  for (let i = 0; i < tokensA.length - 1; i += 1) {
    if (tokensA[i] !== tokensB[i]) return false;
  }
  return tokensA[tokensA.length - 1] !== tokensB[tokensB.length - 1];
}

/**
 * Vocabulario cerrado de descriptores de concentracion/formulacion de
 * perfumeria (no nombres de linea de producto). Se usa SOLO para reconocer
 * que dos nombres son la misma fragancia en distinta concentracion
 * (ej. "Sauvage Parfum" vs "Sauvage EDT" vs "Sauvage Elixir"), nunca para
 * inferir que dos lineas de producto distintas son la misma (ej. "Polo Blue"
 * vs "Polo EST.67" NO califica: "blue" y "est67" no son descriptores de
 * concentracion).
 */
const CONCENTRATION_WORDS = new Set([
  "edt",
  "edp",
  "parfum",
  "perfume",
  "elixir",
  "cologne",
  "colonia",
  "intense",
  "extreme",
  "absolu",
  "extrait",
  "toilette"
]);

/**
 * Detecta que dos nombres comparten el mismo prefijo (una o mas palabras) y
 * difieren solo en la ultima palabra, y que ESA ultima palabra es en ambos
 * casos un descriptor de concentracion conocido. Se usa unicamente para
 * SUGERIR un candidato de revision manual, nunca para fusionar
 * automaticamente.
 */
export function isConcentrationVariant(a: string, b: string): boolean {
  if (a === b) return false;
  const tokensA = a.split(" ").filter(Boolean);
  const tokensB = b.split(" ").filter(Boolean);
  if (tokensA.length < 2 || tokensA.length !== tokensB.length) return false;

  for (let i = 0; i < tokensA.length - 1; i += 1) {
    if (tokensA[i] !== tokensB[i]) return false;
  }

  const lastA = tokensA[tokensA.length - 1];
  const lastB = tokensB[tokensB.length - 1];
  if (lastA === lastB) return false;

  return CONCENTRATION_WORDS.has(lastA) && CONCENTRATION_WORDS.has(lastB);
}
