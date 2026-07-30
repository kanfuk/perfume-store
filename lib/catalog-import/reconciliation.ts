/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Reconciliacion
 * Descripcion: Cruza las filas de julio y junio por clave normalizada
 * (marca+nombre+contenido). El fuzzy matching (variantes tipograficas del
 * nombre) SOLO sugiere candidatos bajo AMBIGUO; nunca fusiona automaticamente
 * una coincidencia incierta.
 */

import type { RawSourceRow, ReconciledEntry, MatchCandidate } from "./types.ts";
import { buildReconciliationKey, normalizeMatchKey, isLikelyTypoVariant } from "./normalization.ts";

function isInvalidRow(row: RawSourceRow): string | null {
  if (!row.perfume) return "Falta el nombre del perfume.";
  if (!row.marca) return "Falta la marca.";
  if (!row.contenido) return "Falta el contenido (ml).";
  return null;
}

export type ReconciliationSummary = {
  entries: ReconciledEntry[];
  invalidJulio: RawSourceRow[];
  invalidJunio: RawSourceRow[];
  duplicatesJulio: RawSourceRow[];
  duplicatesJunio: RawSourceRow[];
};

export function reconcile(julioRows: RawSourceRow[], junioRows: RawSourceRow[]): ReconciliationSummary {
  const invalidJulio: RawSourceRow[] = [];
  const invalidJunio: RawSourceRow[] = [];
  const duplicatesJulio: RawSourceRow[] = [];
  const duplicatesJunio: RawSourceRow[] = [];

  const validJulio: RawSourceRow[] = [];
  const validJunio: RawSourceRow[] = [];

  const entries: ReconciledEntry[] = [];

  const julioSeenKeys = new Map<string, RawSourceRow>();
  for (const row of julioRows) {
    const reason = isInvalidRow(row);
    if (reason) {
      invalidJulio.push(row);
      entries.push({
        classification: "FILA_INVALIDA",
        key: `julio-fila-invalida-${row.rowNumber}`,
        julioRow: row,
        invalidReason: reason
      });
      continue;
    }
    const key = buildReconciliationKey(row.marca, row.perfume, row.contenido);
    if (julioSeenKeys.has(key)) {
      duplicatesJulio.push(row);
      entries.push({ classification: "DUPLICADO", key, julioRow: row });
      continue;
    }
    julioSeenKeys.set(key, row);
    validJulio.push(row);
  }

  const junioSeenKeys = new Map<string, RawSourceRow>();
  for (const row of junioRows) {
    const reason = isInvalidRow(row);
    if (reason) {
      invalidJunio.push(row);
      entries.push({
        classification: "FILA_INVALIDA",
        key: `junio-fila-invalida-${row.rowNumber}`,
        junioRow: row,
        invalidReason: reason
      });
      continue;
    }
    const key = buildReconciliationKey(row.marca, row.perfume, row.contenido);
    if (junioSeenKeys.has(key)) {
      duplicatesJunio.push(row);
      entries.push({ classification: "DUPLICADO", key, junioRow: row });
      continue;
    }
    junioSeenKeys.set(key, row);
    validJunio.push(row);
  }

  const junioByKey = new Map<string, RawSourceRow>();
  for (const row of validJunio) {
    junioByKey.set(buildReconciliationKey(row.marca, row.perfume, row.contenido), row);
  }

  const matchedJunioKeys = new Set<string>();

  for (const julioRow of validJulio) {
    const key = buildReconciliationKey(julioRow.marca, julioRow.perfume, julioRow.contenido);
    const junioMatch = junioByKey.get(key);

    if (junioMatch) {
      matchedJunioKeys.add(key);
      const exact =
        julioRow.marca === junioMatch.marca &&
        julioRow.perfume === junioMatch.perfume &&
        julioRow.contenido === junioMatch.contenido;

      entries.push({
        classification: exact ? "MATCH_EXACTO" : "MATCH_NORMALIZADO",
        key,
        julioRow,
        junioRow: junioMatch
      });
      continue;
    }

    entries.push({ classification: "SOLO_JULIO", key, julioRow });
  }

  for (const junioRow of validJunio) {
    const key = buildReconciliationKey(junioRow.marca, junioRow.perfume, junioRow.contenido);
    if (matchedJunioKeys.has(key)) continue;
    entries.push({ classification: "SOLO_JUNIO", key, junioRow });
  }

  applyFuzzyCandidates(entries);

  return { entries, invalidJulio, invalidJunio, duplicatesJulio, duplicatesJunio };
}

/**
 * Para entradas SOLO_JULIO / SOLO_JUNIO con misma marca+contenido normalizados
 * y nombre "casi igual" (posible typo), se reclasifican como AMBIGUO con
 * candidatos cruzados registrados. Nunca se fusionan automaticamente.
 */
function applyFuzzyCandidates(entries: ReconciledEntry[]): void {
  const soloJulio = entries.filter((e) => e.classification === "SOLO_JULIO");
  const soloJunio = entries.filter((e) => e.classification === "SOLO_JUNIO");

  for (const julioEntry of soloJulio) {
    if (!julioEntry.julioRow) continue;
    const marcaKey = normalizeMatchKey(julioEntry.julioRow.marca);
    const nombreKey = normalizeMatchKey(julioEntry.julioRow.perfume);

    for (const junioEntry of soloJunio) {
      if (!junioEntry.junioRow) continue;
      if (junioEntry.classification === "AMBIGUO") continue;

      const sameMarca = normalizeMatchKey(junioEntry.junioRow.marca) === marcaKey;
      const sameContenido =
        buildReconciliationKey("x", "y", julioEntry.julioRow.contenido) ===
        buildReconciliationKey("x", "y", junioEntry.junioRow.contenido);

      if (!sameMarca || !sameContenido) continue;

      const otherNombreKey = normalizeMatchKey(junioEntry.junioRow.perfume);
      if (!isLikelyTypoVariant(nombreKey, otherNombreKey)) continue;

      const candidateForJulio: MatchCandidate = {
        sheet: "junio",
        rowNumber: junioEntry.junioRow.rowNumber,
        perfume: junioEntry.junioRow.perfume,
        marca: junioEntry.junioRow.marca,
        contenido: junioEntry.junioRow.contenido,
        reason: "Nombre similar (posible variante tipografica) en junio."
      };
      const candidateForJunio: MatchCandidate = {
        sheet: "julio",
        rowNumber: julioEntry.julioRow.rowNumber,
        perfume: julioEntry.julioRow.perfume,
        marca: julioEntry.julioRow.marca,
        contenido: julioEntry.julioRow.contenido,
        reason: "Nombre similar (posible variante tipografica) en julio."
      };

      julioEntry.classification = "AMBIGUO";
      julioEntry.candidates = [...(julioEntry.candidates ?? []), candidateForJulio];
      junioEntry.classification = "AMBIGUO";
      junioEntry.candidates = [...(junioEntry.candidates ?? []), candidateForJunio];
    }
  }
}
