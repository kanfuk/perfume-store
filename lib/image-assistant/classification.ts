import type { QualityFinding, QualityFindingType } from "@/lib/catalog-import/quality-review";
import {
  buildReconciliationKey,
  isStandardVolumeContent,
  normalizeContenido,
  normalizeMatchKey
} from "@/lib/catalog-import/normalization";
import type { SupplierImportRow } from "@/lib/catalog-import/supplier-import";
import type {
  CatalogProductForImageAssistant,
  ImageAssistantAnalysis,
  ImageAssistantItem,
  ImageAssistantStatus,
  SafeImageCandidate
} from "./types";

const AUDIT_FINDING_TYPES = new Set<QualityFindingType>([
  "EXACT_DUPLICATE",
  "POSSIBLE_DUPLICATE",
  "BRAND_INCONSISTENCY",
  "NAME_INCONSISTENCY",
  "MISSING_NAME",
  "MISSING_BRAND",
  "MISSING_CONTENT",
  "INVALID_CONTENT"
]);

const AMBIGUOUS_WORDS = new Set([
  "tester",
  "set",
  "pack",
  "gift",
  "estuche",
  "mini",
  "miniatura",
  "sample",
  "muestra",
  "sin caja"
]);

const CONCENTRATION_TOKENS = new Set([
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
  "toilette"
]);

export function extractConcentration(value: string): string {
  return normalizeMatchKey(value)
    .split(" ")
    .filter((token) => CONCENTRATION_TOKENS.has(token))
    .join(" ");
}

export function hasAmbiguousProductWords(...values: string[]): boolean {
  const normalized = normalizeMatchKey(values.join(" "));
  return [...AMBIGUOUS_WORDS].some((word) => normalized.includes(word));
}

function buildSummary(items: ImageAssistantItem[]): ImageAssistantAnalysis["summary"] {
  const statuses: ImageAssistantStatus[] = [
    "AUTO_SEGURO",
    "REQUIERE_REVISION",
    "YA_TIENE_IMAGEN",
    "SIN_FUENTE_SEGURA",
    "PROVEEDOR_NO_CONFIGURADO",
    "EXCLUIDO_QA",
    "ERROR"
  ];
  const summary = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    ImageAssistantStatus,
    number
  >;
  for (const item of items) summary[item.status] += 1;
  return {
    ...summary,
    total: items.length,
    withoutImage: items.filter((item) => item.status !== "YA_TIENE_IMAGEN").length
  };
}

function rowAuditReasons(rowNumber: number, findings: QualityFinding[]): string[] {
  return findings
    .filter(
      (finding) =>
        finding.rowNumbers.includes(rowNumber) &&
        AUDIT_FINDING_TYPES.has(finding.type)
    )
    .map((finding) => finding.type);
}

function catalogAmbiguityReasons(
  product: CatalogProductForImageAssistant,
  products: CatalogProductForImageAssistant[]
): string[] {
  const reasons: string[] = [];
  const productKey = buildReconciliationKey(
    product.marca ?? "",
    product.nombre,
    product.contenido ?? ""
  );
  if (
    products.filter(
      (candidate) =>
        buildReconciliationKey(
          candidate.marca ?? "",
          candidate.nombre,
          candidate.contenido ?? ""
        ) === productKey
    ).length > 1
  ) {
    reasons.push("DUPLICADO_CATALOGO");
  }

  const nameKey = normalizeMatchKey(product.nombre);
  const sameName = products.filter((candidate) => normalizeMatchKey(candidate.nombre) === nameKey);
  if (new Set(sameName.map((candidate) => normalizeMatchKey(candidate.marca ?? ""))).size > 1) {
    reasons.push("MARCA_INCONSISTENTE_CATALOGO");
  }

  const sameBrandAndName = sameName.filter(
    (candidate) => normalizeMatchKey(candidate.marca ?? "") === normalizeMatchKey(product.marca ?? "")
  );
  const contents = sameBrandAndName.map((candidate) => candidate.contenido ?? "");
  if (
    sameBrandAndName.length > 1 &&
    (new Set(contents.map(normalizeContenido)).size !== contents.length ||
      contents.some((content) => !isStandardVolumeContent(content)))
  ) {
    reasons.push("VARIANTE_NO_INEQUIVOCA");
  }
  return reasons;
}

export function analyzeImageAssistantCatalog(input: {
  products: CatalogProductForImageAssistant[];
  supplierRows: SupplierImportRow[];
  findings: QualityFinding[];
  auditedProductIds?: ReadonlySet<string>;
  reviewReference?: number;
  searchAvailable?: boolean;
}): ImageAssistantAnalysis {
  const reviewReference = input.reviewReference ?? 28;
  const items = input.products.map<ImageAssistantItem>((product) => {
    const base = {
      productId: product.id,
      sku: product.sku?.trim() ?? "",
      brand: product.marca?.trim() ?? "",
      name: product.nombre.trim(),
      content: product.contenido?.trim() ?? ""
    };
    if (base.sku.toUpperCase().startsWith("ZZTEST") || product.activo === false) {
      return { ...base, status: "EXCLUIDO_QA", reasons: ["PRODUCTO_QA_O_PAUSADO"] };
    }
    if (product.imageUrl?.trim() || product.imageStoragePath?.trim()) {
      return { ...base, status: "YA_TIENE_IMAGEN", reasons: ["IMAGEN_EXISTENTE"] };
    }

    const reasons: string[] = [];
    if (!base.sku) reasons.push("SKU_AUSENTE");
    if (!base.name) reasons.push("NOMBRE_AUSENTE");
    if (!base.brand) reasons.push("MARCA_AUSENTE");
    if (!base.content) reasons.push("CONTENIDO_AUSENTE");
    if (base.content && !isStandardVolumeContent(base.content)) reasons.push("CONTENIDO_INVALIDO");
    if (hasAmbiguousProductWords(base.name, base.content)) reasons.push("PALABRA_AMBIGUA");
    if (input.auditedProductIds?.has(product.id)) reasons.push("MARCADO_PARA_AUDITORIA");
    reasons.push(...catalogAmbiguityReasons(product, input.products));

    const exactMatches = input.supplierRows.filter(
      (row) =>
        normalizeMatchKey(row.marca) === normalizeMatchKey(base.brand) &&
        normalizeMatchKey(row.perfume) === normalizeMatchKey(base.name) &&
        normalizeContenido(row.contenido) === normalizeContenido(base.content)
    );
    if (exactMatches.length === 0) reasons.push(product.esTop ? "TOP12_NO_COINCIDE_CSV" : "SIN_MATCH_EXACTO_CSV");
    if (exactMatches.length > 1) reasons.push("MULTIPLES_MATCH_CSV");
    if (exactMatches.length === 1) reasons.push(...rowAuditReasons(exactMatches[0].rowNumber, input.findings));

    if (reasons.length > 0) {
      return {
        ...base,
        status: "REQUIERE_REVISION",
        reasons: [...new Set(reasons)],
        supplierRowNumber: exactMatches[0]?.rowNumber
      };
    }
    return {
      ...base,
      status: "PROVEEDOR_NO_CONFIGURADO",
      reasons: [input.searchAvailable ? "BUSQUEDA_PENDIENTE" : "BUSQUEDA_NO_DISPONIBLE"],
      supplierRowNumber: exactMatches[0].rowNumber
    };
  });
  const summary = buildSummary(items);
  const difference = Math.abs(summary.REQUIERE_REVISION - reviewReference);
  return {
    items,
    summary,
    reviewReferenceDifference: difference,
    batchAllowedByAuditReconciliation: difference <= 5,
    reconciliationApproved: false
  };
}

export function scoreSafeImageCandidate(
  item: ImageAssistantItem,
  candidate: SafeImageCandidate,
  allowedDomains: ReadonlySet<string>
): { score: number; reasons: string[]; contradiction: boolean } {
  const reasons: string[] = [];
  let score = 0;
  const brandExact = normalizeMatchKey(candidate.brand) === normalizeMatchKey(item.brand);
  const nameExact = normalizeMatchKey(candidate.name) === normalizeMatchKey(item.name);
  const concentrationExact =
    extractConcentration(candidate.name) === extractConcentration(item.name) &&
    normalizeMatchKey(candidate.concentration) === extractConcentration(item.name);
  const contentExact = normalizeContenido(candidate.content) === normalizeContenido(item.content);
  const domainApproved = allowedDomains.has(candidate.sourceDomain.toLowerCase());
  const clearImage = candidate.imageRole === "PRODUCT";

  if (brandExact) { score += 25; reasons.push("MARCA_EXACTA"); }
  if (nameExact) { score += 30; reasons.push("NOMBRE_EXACTO"); }
  if (concentrationExact) { score += 20; reasons.push("CONCENTRACION_EXACTA"); }
  if (contentExact) { score += 10; reasons.push("CONTENIDO_EXACTO"); }
  if (domainApproved) { score += 10; reasons.push("FUENTE_APROBADA"); }
  if (clearImage) { score += 5; reasons.push("IMAGEN_DE_PRODUCTO"); }

  return {
    score,
    reasons,
    contradiction: !(brandExact && nameExact && concentrationExact && contentExact && domainApproved && clearImage)
  };
}

export function attachSafeCandidates(
  item: ImageAssistantItem,
  candidates: SafeImageCandidate[],
  allowedDomains: ReadonlySet<string>
): ImageAssistantItem {
  if (item.status !== "SIN_FUENTE_SEGURA" && item.status !== "PROVEEDOR_NO_CONFIGURADO") return item;
  const searchedItem: ImageAssistantItem = item.status === "PROVEEDOR_NO_CONFIGURADO"
    ? { ...item, status: "SIN_FUENTE_SEGURA", reasons: ["BUSQUEDA_COMPLETADA"] }
    : item;
  const scored = candidates
    .map((candidate) => ({ candidate, ...scoreSafeImageCandidate(searchedItem, candidate, allowedDomains) }))
    .filter((result) => result.score >= 95 && !result.contradiction);
  if (scored.length === 0) return { ...searchedItem, reasons: ["SIN_CANDIDATO_SEGURO"] };
  if (scored.length > 1) {
    return { ...searchedItem, status: "REQUIERE_REVISION", reasons: ["MULTIPLES_IMAGENES_POSIBLES"] };
  }
  const selected = scored[0];
  return {
    ...searchedItem,
    status: "AUTO_SEGURO",
    score: selected.score,
    reasons: selected.reasons,
    candidate: { ...selected.candidate, score: selected.score, reasons: selected.reasons }
  };
}
