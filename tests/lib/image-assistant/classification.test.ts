import { describe, expect, it } from "vitest";
import type { CatalogProductForImageAssistant, SafeImageCandidate } from "@/lib/image-assistant/types";
import { analyzeImageAssistantCatalog, attachSafeCandidates, scoreSafeImageCandidate } from "@/lib/image-assistant/classification";
import type { SupplierImportRow } from "@/lib/catalog-import/supplier-import";
import type { QualityFinding, QualityFindingType } from "@/lib/catalog-import/quality-review";

function product(overrides: Partial<CatalogProductForImageAssistant> = {}): CatalogProductForImageAssistant {
  return { id: "p1", sku: "DIOR-SAU-100", nombre: "Sauvage EDP", marca: "Dior", contenido: "100ML", activo: true, imageUrl: "", imageStoragePath: "", esTop: false, ...overrides };
}
function row(overrides: Partial<SupplierImportRow> = {}): SupplierImportRow {
  return { rowNumber: 2, perfume: "Sauvage EDP", marca: "Dior", contenido: "100ML", precioCompra: 50000, ...overrides };
}
function finding(type: QualityFindingType): QualityFinding {
  return { id: `${type}-2`, type, severity: "BLOCKER", rowNumbers: [2], explanation: type, rows: [], options: [] };
}
function candidate(overrides: Partial<SafeImageCandidate> = {}): SafeImageCandidate {
  return { sourceUrl: "https://images.dior.example/sauvage.jpg", sourceDomain: "images.dior.example", authority: "OFFICIAL_BRAND", brand: "Dior", name: "Sauvage EDP", concentration: "edp", content: "100ML", imageRole: "PRODUCT", ...overrides };
}
function analyze(products = [product()], rows = [row()], findings: QualityFinding[] = []) {
  return analyzeImageAssistantCatalog({ products, supplierRows: rows, findings, reviewReference: 0 });
}

describe("safe image assistant classification", () => {
  it("deja una identidad exacta sin candidato como SIN_FUENTE_SEGURA", () => expect(analyze().items[0].status).toBe("SIN_FUENTE_SEGURA"));
  it("clasifica AUTO_SEGURO solo con un candidato único de 100 puntos", () => {
    const item = analyze().items[0];
    const result = attachSafeCandidates(item, [candidate()], new Set(["images.dior.example"]));
    expect(result.status).toBe("AUTO_SEGURO"); expect(result.score).toBe(100);
  });
  it("excluye duplicados exactos detectados por calidad", () => expect(analyze([product()], [row()], [finding("EXACT_DUPLICATE")]).items[0].status).toBe("REQUIERE_REVISION"));
  it("excluye posibles duplicados", () => expect(analyze([product()], [row()], [finding("POSSIBLE_DUPLICATE")]).items[0].reasons).toContain("POSSIBLE_DUPLICATE"));
  it("excluye productos ambiguos tester/set/pack", () => expect(analyze([product({ nombre: "Sauvage EDP Tester" })], [row({ perfume: "Sauvage EDP Tester" })]).items[0].reasons).toContain("PALABRA_AMBIGUA"));
  it("excluye marca incompleta", () => expect(analyze([product({ marca: "" })], [row({ marca: "" })]).items[0].reasons).toContain("MARCA_AUSENTE"));
  it("excluye contenido contradictorio con el CSV", () => expect(analyze([product()], [row({ contenido: "50ML" })]).items[0].reasons).toContain("SIN_MATCH_EXACTO_CSV"));
  it("excluye QA y productos pausados", () => {
    expect(analyze([product({ sku: "ZZTEST-QA-FULL-FLOW" })]).items[0].status).toBe("EXCLUIDO_QA");
    expect(analyze([product({ activo: false })]).items[0].status).toBe("EXCLUIDO_QA");
  });
  it("protege productos que ya tienen cualquiera de los dos campos de imagen", () => {
    expect(analyze([product({ imageUrl: "https://cdn.example/p.webp" })]).items[0].status).toBe("YA_TIENE_IMAGEN");
    expect(analyze([product({ imageStoragePath: "products/p1/x.webp" })]).items[0].status).toBe("YA_TIENE_IMAGEN");
  });
  it("excluye duplicados del catálogo aunque el CSV tenga una fila", () => {
    const result = analyze([product(), product({ id: "p2" })]);
    expect(result.items.every((item) => item.reasons.includes("DUPLICADO_CATALOGO"))).toBe(true);
  });
  it("marca revisión si existe más de una imagen segura posible", () => {
    const result = attachSafeCandidates(analyze().items[0], [candidate(), candidate({ sourceUrl: "https://images.dior.example/other.jpg" })], new Set(["images.dior.example"]));
    expect(result.status).toBe("REQUIERE_REVISION");
  });
  it("una contradicción invalida un score aunque el resto coincida", () => {
    const scored = scoreSafeImageCandidate(analyze().items[0], candidate({ content: "50ML" }), new Set(["images.dior.example"]));
    expect(scored.contradiction).toBe(true); expect(scored.score).toBeLessThan(95);
  });
  it("un dominio no aprobado nunca alcanza AUTO_SEGURO", () => {
    const result = attachSafeCandidates(analyze().items[0], [candidate()], new Set(["otro.example"]));
    expect(result.status).toBe("SIN_FUENTE_SEGURA");
  });
  it("detiene el lote cuando la diferencia con el grupo de revisión supera cinco", () => {
    const result = analyzeImageAssistantCatalog({ products: [product()], supplierRows: [row()], findings: [], reviewReference: 28 });
    expect(result.batchAllowedByAuditReconciliation).toBe(false);
  });
});
