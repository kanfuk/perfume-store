import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("catálogo público completo (debajo de Top 15 / Ofertas)", () => {
  const orderForm = readFileSync("components/OrderForm.tsx", "utf8");
  const catalogExplorer = readFileSync("components/shared/CatalogExplorer.tsx", "utf8");

  it("se monta INMEDIATAMENTE debajo de Top 15 y Ofertas en la home", () => {
    const topIndex = orderForm.indexOf("<TopProductsSection");
    const offersIndex = orderForm.indexOf("<OffersSection");
    const catalogIndex = orderForm.indexOf("<CatalogExplorer");

    expect(topIndex).toBeGreaterThan(-1);
    expect(offersIndex).toBeGreaterThan(topIndex);
    expect(catalogIndex).toBeGreaterThan(offersIndex);
  });

  it("reutiliza la misma fuente de datos publica (products) sin fetch propio", () => {
    expect(catalogExplorer).not.toMatch(/fetch\(/);
    expect(orderForm).toMatch(/<CatalogExplorer[\s\S]*?products=\{products\}/);
  });

  it("titulo y subtitulo coinciden con el encargo", () => {
    expect(catalogExplorer).toContain("Explora todo nuestro catálogo");
    expect(catalogExplorer).toContain(
      "Encuentra tu próxima fragancia entre todas nuestras opciones disponibles."
    );
  });

  it("buscador: placeholder exacto y busca por nombre/marca vía filterAndSortFamilies", () => {
    expect(catalogExplorer).toContain("Buscar perfume o marca...");
    expect(catalogExplorer).toContain("filterAndSortFamilies");
  });

  it("filtro de marca es un select dinamico con opcion 'Todos'", () => {
    expect(catalogExplorer).toMatch(/<select[\s\S]*?aria-label="Filtrar por marca"/);
    expect(catalogExplorer).toContain('<option value="">Todos</option>');
    expect(catalogExplorer).toContain("getAvailableFamilyBrands");
  });

  it("orden: expone las 4 opciones pedidas (A-Z, Z-A, precio asc/desc)", () => {
    expect(catalogExplorer).toContain("Nombre A-Z");
    expect(catalogExplorer).toContain("Nombre Z-A");
    expect(catalogExplorer).toContain("Precio: menor a mayor");
    expect(catalogExplorer).toContain("Precio: mayor a menor");
  });

  it("contador de resultados con singular/plural correcto, solo con filtro activo", () => {
    expect(catalogExplorer).toContain('"perfume encontrado" : "perfumes encontrados"');
    expect(catalogExplorer).toContain("hasActiveFilters");
  });

  it("estado vacio usa el copy exacto del encargo", () => {
    expect(catalogExplorer).toContain("No encontramos perfumes para tu búsqueda.");
    expect(catalogExplorer).toContain("Prueba buscando por nombre o marca.");
  });

  it("vista inicial 6 y expansion +12 usan las constantes compartidas de lib/catalog-pagination", () => {
    expect(catalogExplorer).toContain("CATALOG_INITIAL_VISIBLE_COUNT");
    expect(catalogExplorer).toContain("nextCatalogVisibleCount");
    expect(catalogExplorer).toContain("hasMoreCatalogItems");
    expect(catalogExplorer).toContain('"Ver catálogo completo"');
    expect(catalogExplorer).toContain('"Mostrar más"');
  });

  it("grid mobile-first: 2 columnas por defecto, 3 en md (768px), 4 en lg (1440px), nunca fuerza 5", () => {
    expect(catalogExplorer).toMatch(/grid-cols-2[^"]*md:grid-cols-3[^"]*lg:grid-cols-4/);
    expect(catalogExplorer).not.toContain("grid-cols-5");
    expect(catalogExplorer).not.toContain("xl:grid-cols-5");
  });

  it("PROHIBIDO: no crea un contenedor con scroll interno propio (solo scroll normal de pagina)", () => {
    expect(catalogExplorer).not.toContain("overflow-y-auto");
    expect(catalogExplorer).not.toContain("overflow-auto");
    expect(catalogExplorer).not.toMatch(/max-h-(\[|\d)/);
  });

  it("reutiliza ProductFamilyCard (imagen + selector de tamaño), no reimplementa la tarjeta", () => {
    expect(catalogExplorer).toContain("ProductFamilyCard");
    expect(catalogExplorer).toContain('imageFit="contain"');
  });

  it("no inventa badges TOP/OFERTA: no pasa un rank artificial a la tarjeta del catálogo completo", () => {
    expect(catalogExplorer).not.toMatch(/<ProductFamilyCard[\s\S]*?rank=/);
  });

  it("accesibilidad: buscador y selects tienen aria-label", () => {
    expect(catalogExplorer).toContain('aria-label="Buscar perfume o marca"');
    expect(catalogExplorer).toContain('aria-label="Filtrar por marca"');
    expect(catalogExplorer).toContain('aria-label="Ordenar catálogo"');
  });

  it("Top 15 permanece intacto: mismo componente, mismo limite, sin cambios de props", () => {
    expect(orderForm).toMatch(/<TopProductsSection[\s\S]*?products=\{products\}[\s\S]*?\/>/);
    const topProductsSection = readFileSync("components/shared/TopProductsSection.tsx", "utf8");
    expect(topProductsSection).toContain("TOP_PRODUCTS_LIMIT");
    expect(topProductsSection).toContain("getTopFamilies");
  });

  it("Ofertas permanece intacto: mismo componente montado sin cambios", () => {
    expect(orderForm).toMatch(/<OffersSection[\s\S]*?products=\{products\}[\s\S]*?\/>/);
  });

  it("no crea ninguna migration Supabase nueva para esta feature (100% presentación)", () => {
    // Esta feature reutiliza /api/products tal cual; no debe introducir
    // migraciones nuevas. La ultima migracion conocida antes de esta fase es
    // la de eliminacion segura de productos (V2.2.1). Las siguientes
    // migraciones mas recientes son de otras ramas/fases -- no pertenecen al
    // catalogo publico, por eso se excluyen explicitamente aqui:
    //  - edicion segura de nombre (Parte A de esta misma rama, ver
    //    docs/SMELLME_SAFE_PRODUCT_RENAME_DESIGN.md);
    //  - hotfix de integridad de identidad del comprador (rama
    //    hotfix/customer-order-identity-integrity, snapshot historico en
    //    pedidos + regla de identidad segura en create_perfume_order_v1).
    const baselineMigration = "20260814000000_smellme_safe_product_removal.sql";
    const knownUnrelatedMigrations = new Set([
      "20260815000000_smellme_product_name_manual_lock.sql",
      "20260816000000_smellme_customer_order_identity_integrity.sql"
    ]);
    const allMigrations = readdirSync("supabase/migrations");
    expect(allMigrations).toContain(baselineMigration);
    const newerThanKnownBaseline = allMigrations.filter(
      (name) =>
        name.endsWith(".sql") && name > baselineMigration && !knownUnrelatedMigrations.has(name)
    );
    expect(newerThanKnownBaseline).toEqual([]);
  });
});
