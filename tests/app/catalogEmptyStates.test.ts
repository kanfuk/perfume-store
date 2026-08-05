import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.2: estados vacíos de Productos y Top 15 (catálogo productivo
 * vacío). Sin jsdom/RTL en este proyecto: se verifica por inspección de
 * código fuente, el mismo patrón ya usado en el resto de la suite
 * (ver tests/app/productImageSameOriginConsumers.test.ts,
 * tests/app/publicCatalogEmptyState.test.ts).
 */
describe("CatalogControlCenter: estado vacío real de Productos", () => {
  const source = readFileSync("components/admin/CatalogControlCenter.tsx", "utf8");

  it("distingue catálogo sin ningún producto de 'sin resultados para la búsqueda'", () => {
    expect(source).toMatch(/indicators\.total === 0/);
    expect(source).toContain("Todavía no hay perfumes en el catálogo.");
    expect(source).toContain("Sin productos que coincidan con la búsqueda.");
  });

  it("ofrece las dos CTA requeridas: Agregar perfume e Importar catálogo", () => {
    expect(source).toMatch(/function EmptyCatalogMessage/);
    expect(source).toMatch(/onAddPerfume/);
    expect(source).toMatch(/Agregar perfume/);
    expect(source).toMatch(/href="\/admin\/importar-catalogo"/);
    expect(source).toContain("Importar catálogo");
  });

  it("el mensaje vacío real aparece tanto en la tabla de escritorio como en las tarjetas móviles", () => {
    const occurrences = source.match(/<EmptyCatalogMessage onAddPerfume=\{\(\) => setShowAddModal\(true\)\} \/>/g) ?? [];
    expect(occurrences.length).toBe(2);
  });
});

describe("Top12AdminPanel: estado vacío real del Top 15 (sin productos en catálogo)", () => {
  const source = readFileSync("components/admin/Top12AdminPanel.tsx", "utf8");

  it("explica que primero deben existir productos, sin mostrar una grilla vacía sin orientación", () => {
    expect(source).toMatch(/products\.length === 0/);
    expect(source).toContain("Todavía no hay perfumes en el catálogo.");
  });

  it("ofrece CTA hacia Productos e Importar catálogo", () => {
    expect(source).toMatch(/href="\/admin\/catalogo\/productos"/);
    expect(source).toMatch(/href="\/admin\/importar-catalogo"/);
  });

  it("muestra el contador 'X de N seleccionados' usando TOP_PRODUCTS_LIMIT", () => {
    expect(source).toMatch(/de \{TOP_PRODUCTS_LIMIT\} seleccionados/);
  });
});
