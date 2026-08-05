import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchBulkProductImages } from "@/lib/product-image-bulk-matching";

const panelSource = readFileSync("components/admin/BulkProductImagePanel.tsx", "utf8");

describe("Carga masiva de imagenes - seguridad", () => {
  it("toCandidateProduct nunca mapea costo ni precio (solo identidad + imagen)", () => {
    const match = panelSource.match(/function toCandidateProduct[\s\S]*?\n\}/);
    expect(match?.[0] ?? "").not.toMatch(/costoUnitario|precioVenta|modoPrecio/);
  });

  it("BulkImageCandidateProduct (tipo) no declara ningun campo de costo/precio", () => {
    const types = readFileSync("lib/product-image-bulk-types.ts", "utf8");
    const match = types.match(/export type BulkImageCandidateProduct = \{[\s\S]*?\};/);
    expect(match?.[0] ?? "").not.toMatch(/costo|precio/i);
  });

  it("el motor de matching solo devuelve fileId/productId, nunca datos de costo", () => {
    const rows = matchBulkProductImages(
      [{ fileId: "a", fileName: "SML-0001.jpg", fileSize: 100, mimeType: "image/jpeg" }],
      [{ id: "p1", sku: "SML-0001", nombre: "X" }]
    );
    expect(JSON.stringify(rows)).not.toMatch(/costo|precio/i);
  });

  it("solo llama a los dos endpoints admin ya existentes (lista y subida individual)", () => {
    expect(panelSource).toMatch(/fetchJson\("\/api\/admin\/products"/);
    expect(panelSource).toMatch(/\/api\/admin\/products\/\$\{job\.productId\}\/image/);
    expect(panelSource).not.toMatch(/\/api\/admin\/products\/bulk/);
  });

  it("cada subida sigue exigiendo el producto+imagen+storagePath en la respuesta antes de marcar exito", () => {
    const match = panelSource.match(/async function uploadOne[\s\S]*?\n  \}/);
    expect(match?.[0] ?? "").toMatch(/data\.product.*data\.imageStoragePath.*data\.imageUrl/);
  });
});
