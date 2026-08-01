import { describe, expect, it } from "vitest";
import { catalogBackupToCsv, classifyQaEvidence, classifyStorageOrphans, isSafeProductStoragePath } from "@/lib/mvp-maintenance";

describe("clasificador QA conservador", () => {
  it.each([
    [{ sku: "ZZTEST-QA-FULL-FLOW" }, "ZZTEST"],
    [{ email: "harness@example.com" }, "EMAIL_HARNESS_EXAMPLE_COM"],
    [{ name: "QA Smellme Full Flow" }, "NOMBRE_QA_DOCUMENTADO"],
    [{ idempotencyKey: "QA-order-123" }, "IDEMPOTENCIA_QA"],
    [{ observation: "QA: smoke" }, "PEDIDO_QA_EXPLICITO"],
    [{ imageStoragePath: "products/qa/test.webp" }, "RUTA_STORAGE_QA"],
    [{ explicitlyRegistered: true }, "ID_QA_REGISTRADO"]
  ])("acepta solo evidencia explícita", (input, evidence) => {
    expect(classifyQaEvidence(input)).toEqual(expect.objectContaining({ isQa: true, evidence: expect.arrayContaining([evidence]) }));
  });

  it.each([{ observation: "venta directa" }, { observation: "monto 100" }, { observation: "ENTREGADO" }, { observation: "2026-08-01" }, { email: "persona@gmail.com" }])("rechaza heurísticas ambiguas", (input) => {
    expect(classifyQaEvidence(input).isQa).toBe(false);
  });
});

describe("Storage y respaldo", () => {
  it("solo acepta WebP bajo products/", () => {
    expect(isSafeProductStoragePath("products/a/b.webp")).toBe(true);
    expect(isSafeProductStoragePath("other/a.webp")).toBe(false);
    expect(isSafeProductStoragePath("products/../a.webp")).toBe(false);
  });

  it("calcula huérfanos sin aceptar rutas arbitrarias", () => {
    const result = classifyStorageOrphans(["products/a/used.webp", "products/a/orphan.webp", "products/qa/test.webp", "products/a/not-image.txt", "outside/x.webp"], ["products/a/used.webp"]);
    expect(result.orphanPaths).toEqual(["products/a/orphan.webp"]);
    expect(result.qaExcludedCount).toBe(1);
    expect(result.invalidCount).toBe(1);
    expect(result.outsidePrefixCount).toBe(1);
  });

  it("escapa CSV y no inventa campos personales", () => {
    const csv = catalogBackupToCsv({ schemaVersion: "smellme-catalog-backup-v1", appVersion: "2.0.0-rc.1", generatedAt: "2026-08-01T00:00:00.000Z", productCount: 1, products: [{ id: "1", sku: null, nombre: "A, \"B\"", marca: null, contenido: null, descripcion: null, precioVenta: 1, precioAnterior: null, costoUnitario: 0, stockActual: 0, stockReservado: 0, stockMinimo: 0, activo: true, esTop: false, esOfertaSemana: false, ordenDestacado: null, tipoProducto: null, modoPrecio: "AUTO", imageUrl: null, imageStoragePath: null, createdAt: "x", updatedAt: "x" }] });
    expect(csv).toContain('"A, ""B"""');
    expect(csv).not.toMatch(/email|telefono|banco/i);
  });
});
