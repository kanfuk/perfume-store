import { readFileSync, existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fase 7.4A: verificacion por inspeccion de codigo fuente (mismo patron que
 * tests/app/bulkProductImagePanel.test.ts, sin jsdom/RTL en este proyecto)
 * de los cierres de brecha sobre Ofertas de la semana: atomicidad
 * documentada (no resuelta con migracion), producto pausado, politica de
 * precioAnterior al desactivar, y exposicion publica de precio anterior.
 */
const productoServiceSource = readFileSync("services/productoService.ts", "utf8");
const ofertasPanelSource = readFileSync("components/admin/OfertasAdminPanel.tsx", "utf8");
const productCardSource = readFileSync("components/shared/ProductCard.tsx", "utf8");
const productFamilyCardSource = readFileSync("components/shared/ProductFamilyCard.tsx", "utf8");
const cardMetadataSource = readFileSync("lib/product-card-metadata.ts", "utf8");
const productoRepositorySource = readFileSync("repositories/productRepository.ts", "utf8");
const domainProductoSource = readFileSync("domain/Producto.ts", "utf8");

describe("Fase 7.4A: atomicidad del maximo de ofertas documentada, no resuelta con migracion", () => {
  it("no se creo ninguna migracion, funcion SQL ni RPC nueva para ofertas", () => {
    const migrationFiles = existsSync("supabase/migrations") ? readdirSync("supabase/migrations") : [];
    expect(migrationFiles.some((name) => /oferta|offer/i.test(name))).toBe(false);
    expect(productoRepositorySource).not.toMatch(/activate_weekly_offer/i);
    expect(productoRepositorySource).not.toMatch(/\.rpc\(\s*["']activ.*oferta/i);
  });

  it("activarOfertaSemana sigue usando conteo + escritura separados (sin CAS), documentado en su JSDoc", () => {
    const fnMatch = productoServiceSource.match(/async activarOfertaSemana\([\s\S]*?\n  \}/);
    expect(fnMatch?.[0]).toMatch(/buscarTodosProductos/);
    const docMatch = productoServiceSource.match(/\/\*\*[\s\S]*?\*\/\s*\n\s*async activarOfertaSemana/);
    expect(docMatch?.[0]).toMatch(/ATOMICIDAD/);
    expect(docMatch?.[0]).toMatch(/SMELLME_OFFERS_ATOMICITY_PROPOSAL\.md/);
  });

  it("existe el documento de propuesta y confirma explicitamente que no fue aplicada", () => {
    expect(existsSync("docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md")).toBe(true);
    const proposal = readFileSync("docs/SMELLME_OFFERS_ATOMICITY_PROPOSAL.md", "utf8");
    expect(proposal).toMatch(/no fue aplicada/i);
    expect(proposal).toMatch(/escenario de carrera/i);
    expect(proposal).toMatch(/OFFERS_LIMIT/);
  });

  it("la prueba de concurrencia que demuestra la carrera existe y no fue debilitada", () => {
    expect(existsSync("tests/services/productoService.ofertasConcurrency.test.ts")).toBe(true);
  });
});

describe("Fase 7.4A: contrato de activacion respeta productos pausados", () => {
  it("activarOfertaSemana rechaza una activacion NUEVA sobre un producto pausado", () => {
    const fnMatch = productoServiceSource.match(/async activarOfertaSemana\([\s\S]*?\n  \}/);
    expect(fnMatch?.[0]).toMatch(/producto\.activo === false/);
    expect(fnMatch?.[0]).toMatch(/pausado/);
  });

  it("el panel de Ofertas deshabilita 'Agregar' para productos pausados", () => {
    expect(ofertasPanelSource).toMatch(/disabled=\{pendingId === product\.id \|\| maxAlcanzado \|\| pausado\}/);
  });
});

describe("Fase 7.4A: politica de precioAnterior al retirar una oferta", () => {
  it("desactivarOfertaSemana limpia precioAnterior (politica A)", () => {
    const fnMatch = productoServiceSource.match(/async desactivarOfertaSemana\([\s\S]*?\n  \}/);
    expect(fnMatch?.[0]).toMatch(/precioAnterior:\s*null/);
  });

  it("ProductoProps.precioAnterior admite null explicitamente (para poder limpiarlo)", () => {
    expect(domainProductoSource).toMatch(/precioAnterior\?:\s*number\s*\|\s*null/);
  });
});

describe("Fase 7.4A: exposicion publica de precio anterior (seccion 7)", () => {
  it("hasVisiblePreviousPrice exige esOfertaSemana=true, ademas de precioAnterior > precioVenta", () => {
    expect(cardMetadataSource).toMatch(/esOfertaSemana === true/);
    expect(cardMetadataSource).toMatch(/precioAnterior > product\.precioVenta/);
  });

  it("ProductCard usa hasVisiblePreviousPrice en vez de su propio calculo inline", () => {
    expect(productCardSource).toMatch(/hasVisiblePreviousPrice\(product\)/);
    expect(productCardSource).not.toMatch(/typeof product\.precioAnterior === "number" && product\.precioAnterior > product\.precioVenta/);
  });

  it("ProductFamilyCard (Top 15 / catalogo) traslada esOfertaSemana a la tarjeta publica, evitando falsos negativos", () => {
    expect(productFamilyCardSource).toMatch(/esOfertaSemana:\s*selected\.esOfertaSemana/);
  });
});

describe("Fase 7.4A: no se expone informacion administrativa en el catalogo publico", () => {
  it("obtenerProductosActivos no incluye costoUnitario ni imageStoragePath en su salida", () => {
    const fnMatch = productoServiceSource.match(/async obtenerProductosActivos\(\)[\s\S]*?\n  \}/);
    expect(fnMatch?.[0]).not.toMatch(/costoUnitario:/);
    expect(fnMatch?.[0]).not.toMatch(/imageStoragePath:/);
  });
});
