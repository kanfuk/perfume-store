import { describe, expect, it } from "vitest";
import {
  CATALOG_INITIAL_VISIBLE_COUNT,
  CATALOG_LOAD_MORE_STEP,
  hasMoreCatalogItems,
  isFirstCatalogExpansion,
  nextCatalogVisibleCount
} from "@/lib/catalog-pagination";

describe("catalog-pagination (catalogo completo publico)", () => {
  it("vista inicial es de 6 productos (2 columnas x 3 filas en mobile)", () => {
    expect(CATALOG_INITIAL_VISIBLE_COUNT).toBe(6);
  });

  it("cada expansion revela 12 productos adicionales", () => {
    expect(CATALOG_LOAD_MORE_STEP).toBe(12);
    expect(nextCatalogVisibleCount(6)).toBe(18);
    expect(nextCatalogVisibleCount(18)).toBe(30);
  });

  it("hasMoreCatalogItems es true mientras queden productos por mostrar", () => {
    expect(hasMoreCatalogItems(20, 6)).toBe(true);
    expect(hasMoreCatalogItems(6, 6)).toBe(false);
    expect(hasMoreCatalogItems(3, 6)).toBe(false); // catalogo con menos de 6 productos
  });

  it("isFirstCatalogExpansion distingue el primer click ('Ver catálogo completo') de los siguientes ('Mostrar más')", () => {
    expect(isFirstCatalogExpansion(CATALOG_INITIAL_VISIBLE_COUNT)).toBe(true);
    expect(isFirstCatalogExpansion(CATALOG_INITIAL_VISIBLE_COUNT + CATALOG_LOAD_MORE_STEP)).toBe(false);
  });
});
