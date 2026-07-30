/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Asociacion Top 12
 * Descripcion: Asocia cada fotografia del Top 12 (identificada por marca+nombre
 * observados directamente en la imagen) con un producto del catalogo canonico.
 * Nunca adivina: si hay 0 candidatos queda SIN_MATCH_EN_PLANILLAS, si hay
 * exactamente 1 candidato no exacto queda CANDIDATO_UNICO_NO_CONFIRMADO
 * (requiere confirmacion humana), si hay 2+ queda AMBIGUO.
 */

import type { CanonicalProduct, ReconciledEntry, Top12ImageEntry, Top12MatchStatus, Top12RankingItem } from "./types.ts";
import { normalizeMatchKey, isLikelyTypoVariant, differsOnlyInLastToken, isConcentrationVariant } from "./normalization.ts";

type Candidate = {
  label: string;
  sku?: string;
};

function isFamilyVariant(a: string, b: string): boolean {
  if (a === b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (!longer.startsWith(`${shorter} `)) return false;
  const suffix = longer.slice(shorter.length).trim();
  return suffix.length > 0 && suffix.length <= shorter.length;
}

/** Tolera errores de tipeo menores en la marca (ej. "Yves Saint Laurent" vs "Yves Saint Lauren" en las planillas). */
function isSameOrSimilarMarca(a: string, b: string): boolean {
  return a === b || isLikelyTypoVariant(a, b);
}

function isRelatedCandidate(rankingNombreKey: string, otherNombreKey: string): boolean {
  return (
    isLikelyTypoVariant(rankingNombreKey, otherNombreKey) ||
    isFamilyVariant(rankingNombreKey, otherNombreKey) ||
    differsOnlyInLastToken(rankingNombreKey, otherNombreKey) ||
    isConcentrationVariant(rankingNombreKey, otherNombreKey)
  );
}

export function associateTop12(
  ranking: Top12RankingItem[],
  canonicalProducts: CanonicalProduct[],
  ambiguousEntries: ReconciledEntry[]
): Map<number, { status: Top12MatchStatus; sku: string | null; candidates: string[] }> {
  const result = new Map<number, { status: Top12MatchStatus; sku: string | null; candidates: string[] }>();

  for (const item of ranking) {
    const marcaKey = normalizeMatchKey(item.marca);
    const nombreKey = normalizeMatchKey(item.nombre);

    const sameMarcaProducts = canonicalProducts.filter((p) =>
      isSameOrSimilarMarca(normalizeMatchKey(p.marca), marcaKey)
    );

    const exactMatches = sameMarcaProducts.filter((p) => normalizeMatchKey(p.nombre) === nombreKey);

    if (exactMatches.length === 1) {
      result.set(item.rank, {
        status: "MATCH_CONFIRMADO",
        sku: exactMatches[0].sku,
        candidates: [exactMatches[0].sku]
      });
      continue;
    }

    if (exactMatches.length > 1) {
      result.set(item.rank, {
        status: "AMBIGUO",
        sku: null,
        candidates: exactMatches.map((p) => p.sku)
      });
      continue;
    }

    const candidates: Candidate[] = [];

    for (const product of sameMarcaProducts) {
      if (isRelatedCandidate(nombreKey, normalizeMatchKey(product.nombre))) {
        candidates.push({ label: `${product.marca} ${product.nombre} (${product.contenido}) [SKU ${product.sku}]`, sku: product.sku });
      }
    }

    for (const entry of ambiguousEntries) {
      if (entry.julioRow && isSameOrSimilarMarca(normalizeMatchKey(entry.julioRow.marca), marcaKey)) {
        if (isRelatedCandidate(nombreKey, normalizeMatchKey(entry.julioRow.perfume))) {
          candidates.push({
            label: `${entry.julioRow.marca} ${entry.julioRow.perfume} (${entry.julioRow.contenido}) [julio fila ${entry.julioRow.rowNumber}, pendiente de conciliacion]`
          });
        }
      }
      if (entry.junioRow && isSameOrSimilarMarca(normalizeMatchKey(entry.junioRow.marca), marcaKey)) {
        if (isRelatedCandidate(nombreKey, normalizeMatchKey(entry.junioRow.perfume))) {
          candidates.push({
            label: `${entry.junioRow.marca} ${entry.junioRow.perfume} (${entry.junioRow.contenido}) [junio fila ${entry.junioRow.rowNumber}, pendiente de conciliacion]`
          });
        }
      }
    }

    if (candidates.length === 0) {
      result.set(item.rank, { status: "SIN_MATCH_EN_PLANILLAS", sku: null, candidates: [] });
    } else if (candidates.length === 1) {
      result.set(item.rank, {
        status: "CANDIDATO_UNICO_NO_CONFIRMADO",
        sku: candidates[0].sku ?? null,
        candidates: [candidates[0].label]
      });
    } else {
      result.set(item.rank, {
        status: "AMBIGUO",
        sku: null,
        candidates: candidates.map((c) => c.label)
      });
    }
  }

  return result;
}

export function buildTop12ImageEntries(
  ranking: Top12RankingItem[],
  images: { rank: number; sourceFile: string; sourceSha256: string; imageUrl: string }[],
  canonicalProducts: CanonicalProduct[],
  ambiguousEntries: ReconciledEntry[]
): Top12ImageEntry[] {
  const associations = associateTop12(ranking, canonicalProducts, ambiguousEntries);
  const rankingByRank = new Map(ranking.map((r) => [r.rank, r]));
  const productBySku = new Map(canonicalProducts.map((p) => [p.sku, p]));

  return images
    .sort((a, b) => a.rank - b.rank)
    .map((image) => {
      const association = associations.get(image.rank);
      const rankingItem = rankingByRank.get(image.rank);
      const product = association?.sku ? productBySku.get(association.sku) : undefined;

      return {
        rank: image.rank,
        sourceFile: image.sourceFile,
        sourceSha256: image.sourceSha256,
        canonicalSku: association?.status === "MATCH_CONFIRMADO" ? association.sku : null,
        canonicalName: association?.status === "MATCH_CONFIRMADO" ? product?.nombre ?? null : null,
        canonicalBrand: association?.status === "MATCH_CONFIRMADO" ? product?.marca ?? null : null,
        imageUrl: image.imageUrl,
        matchStatus: association?.status ?? "SIN_MATCH_EN_PLANILLAS",
        candidates: association?.candidates,
        notes: rankingItem ? `Foto identificada como: ${rankingItem.marca} - ${rankingItem.nombre}` : undefined
      } satisfies Top12ImageEntry;
    });
}
