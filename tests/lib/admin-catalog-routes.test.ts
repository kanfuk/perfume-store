import { describe, expect, it } from "vitest";
import {
  CATALOG_SECTIONS,
  CATALOG_SECTION_LABELS,
  buildCatalogSectionHref,
  resolveActiveCatalogSection,
  resolveLegacyCatalogRedirect,
  buildQueryStringFromParams
} from "@/lib/admin-catalog-routes.ts";

describe("admin-catalog-routes - buildCatalogSectionHref", () => {
  it("construye la ruta base sin parametros", () => {
    expect(buildCatalogSectionHref("resumen")).toBe("/admin/catalogo");
    expect(buildCatalogSectionHref("productos")).toBe("/admin/catalogo/productos");
    expect(buildCatalogSectionHref("stock")).toBe("/admin/catalogo/stock");
    expect(buildCatalogSectionHref("precios")).toBe("/admin/catalogo/precios");
    expect(buildCatalogSectionHref("top12")).toBe("/admin/catalogo/top12");
    expect(buildCatalogSectionHref("imagenes")).toBe("/admin/catalogo/imagenes");
  });

  it("agrega parametros como querystring", () => {
    expect(buildCatalogSectionHref("productos", { estado: "incompleto" })).toBe(
      "/admin/catalogo/productos?estado=incompleto"
    );
  });

  it("preserva q junto a otros filtros (ejemplo obligatorio del encargo)", () => {
    expect(buildCatalogSectionHref("stock", { stock: "agotado", q: "Lady" })).toBe(
      "/admin/catalogo/stock?stock=agotado&q=Lady"
    );
  });

  it("omite parametros undefined o vacios (nunca deja '?' colgando ni 'q=' vacio)", () => {
    expect(buildCatalogSectionHref("precios", { modo: "MANUAL", q: undefined })).toBe(
      "/admin/catalogo/precios?modo=MANUAL"
    );
    expect(buildCatalogSectionHref("top12", { q: "" })).toBe("/admin/catalogo/top12");
  });

  it("nunca incluye IDs de seleccion en la URL (solo los parametros explicitos que se le pasan)", () => {
    const href = buildCatalogSectionHref("stock", { q: "Lady" });
    expect(href).not.toMatch(/selectedIds|productId/i);
  });
});

describe("admin-catalog-routes - resolveActiveCatalogSection", () => {
  it("identifica el resumen en /admin/catalogo exacto", () => {
    expect(resolveActiveCatalogSection("/admin/catalogo")).toBe("resumen");
    expect(resolveActiveCatalogSection("/admin/catalogo/")).toBe("resumen");
  });

  it("identifica cada seccion anidada", () => {
    expect(resolveActiveCatalogSection("/admin/catalogo/productos")).toBe("productos");
    expect(resolveActiveCatalogSection("/admin/catalogo/stock")).toBe("stock");
    expect(resolveActiveCatalogSection("/admin/catalogo/precios")).toBe("precios");
    expect(resolveActiveCatalogSection("/admin/catalogo/top12")).toBe("top12");
    expect(resolveActiveCatalogSection("/admin/catalogo/imagenes")).toBe("imagenes");
  });

  it("retorna null para rutas fuera de /admin/catalogo (no monta paneles ajenos)", () => {
    expect(resolveActiveCatalogSection("/admin")).toBeNull();
    expect(resolveActiveCatalogSection("/admin/pedidos")).toBeNull();
    expect(resolveActiveCatalogSection("/admin/stock")).toBeNull();
  });

  it("CATALOG_SECTIONS/CATALOG_SECTION_LABELS incluyen el asistente de imágenes", () => {
    expect(CATALOG_SECTIONS).toEqual(["resumen", "productos", "stock", "precios", "top12", "imagenes"]);
    for (const section of CATALOG_SECTIONS) {
      expect(CATALOG_SECTION_LABELS[section]).toBeTruthy();
    }
  });
});

describe("admin-catalog-routes - resolveLegacyCatalogRedirect (rutas antiguas)", () => {
  it("redirige /admin/stock -> /admin/catalogo/stock", () => {
    expect(resolveLegacyCatalogRedirect("/admin/stock", "")).toBe("/admin/catalogo/stock");
  });

  it("redirige /admin/precios -> /admin/catalogo/precios", () => {
    expect(resolveLegacyCatalogRedirect("/admin/precios", "")).toBe("/admin/catalogo/precios");
  });

  it("redirige /admin/top12 -> /admin/catalogo/top12", () => {
    expect(resolveLegacyCatalogRedirect("/admin/top12", "")).toBe("/admin/catalogo/top12");
  });

  it("preserva el querystring original (busqueda/filtros)", () => {
    expect(resolveLegacyCatalogRedirect("/admin/stock", "?q=Lady&stock=agotado")).toBe(
      "/admin/catalogo/stock?q=Lady&stock=agotado"
    );
  });

  it("retorna null para rutas que no son legacy conocidas", () => {
    expect(resolveLegacyCatalogRedirect("/admin/catalogo", "")).toBeNull();
    expect(resolveLegacyCatalogRedirect("/admin/pedidos", "")).toBeNull();
  });
});

describe("admin-catalog-routes - buildQueryStringFromParams", () => {
  it("reconstruye un querystring a partir de searchParams de Next.js", () => {
    expect(buildQueryStringFromParams({ q: "Lady", estado: "incompleto" })).toBe("?q=Lady&estado=incompleto");
  });

  it("retorna cadena vacia sin parametros", () => {
    expect(buildQueryStringFromParams({})).toBe("");
  });

  it("ignora valores undefined y usa el primer elemento si es array", () => {
    expect(buildQueryStringFromParams({ q: undefined, estado: ["incompleto", "otro"] })).toBe("?estado=incompleto");
  });
});
