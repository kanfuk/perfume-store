import { describe, expect, it } from "vitest";
import {
  selectIds,
  clearSelection,
  toggleId,
  countVisibleSelected,
  isEntireCatalogSelected,
  toUniqueIdArray
} from "@/lib/bulk-selection.ts";

describe("bulk-selection - selectIds (seleccionar visibles/resultados/todo)", () => {
  it("agrega ids sin duplicar (union con la seleccion actual)", () => {
    const current = new Set(["a", "b"]);
    const next = selectIds(current, ["b", "c"]);
    expect([...next].sort()).toEqual(["a", "b", "c"]);
  });

  it("no muta el Set original", () => {
    const current = new Set(["a"]);
    selectIds(current, ["b"]);
    expect([...current]).toEqual(["a"]);
  });

  it("seleccionar visibles solo agrega los ids de la pagina/rango actual, no todo el catalogo", () => {
    const visiblesEnPantalla = ["p1", "p2"]; // ej. primeros 2 de una lista paginada de 10
    const seleccion = selectIds(new Set(), visiblesEnPantalla);
    expect(seleccion.size).toBe(2);
    expect(seleccion.has("p10")).toBe(false);
  });

  it("seleccionar todos los resultados filtrados incluye productos fuera de la pagina visible", () => {
    const resultadosFiltrados = ["p1", "p2", "p3", "p4", "p5"]; // 5 resultados, solo 2 renderizados
    const seleccion = selectIds(new Set(), resultadosFiltrados);
    expect(seleccion.size).toBe(5);
  });

  it("seleccionar todo el catalogo ignora busqueda/filtros", () => {
    const catalogoCompleto = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const seleccion = selectIds(new Set(), catalogoCompleto);
    expect(seleccion.size).toBe(6);
  });
});

describe("bulk-selection - clearSelection", () => {
  it("vacia completamente la seleccion", () => {
    expect(clearSelection().size).toBe(0);
  });
});

describe("bulk-selection - toggleId", () => {
  it("agrega si no estaba, quita si ya estaba", () => {
    const withId = toggleId(new Set(), "p1");
    expect(withId.has("p1")).toBe(true);
    const withoutId = toggleId(withId, "p1");
    expect(withoutId.has("p1")).toBe(false);
  });

  it("variantes del mismo perfume (distinto contenido) son productId independientes", () => {
    // Lady Million 30ML/50ML/80ML son 3 productId reales distintos.
    let selection = new Set<string>();
    selection = toggleId(selection, "lm-30ml");
    selection = toggleId(selection, "lm-80ml");
    expect(selection.has("lm-30ml")).toBe(true);
    expect(selection.has("lm-50ml")).toBe(false); // no seleccionada independientemente
    expect(selection.has("lm-80ml")).toBe(true);
  });
});

describe("bulk-selection - countVisibleSelected / aviso fuera de filtro", () => {
  it("cuenta cuantos seleccionados son visibles bajo el filtro actual", () => {
    const selected = new Set(["p1", "p2", "p3"]);
    const visibleAhora = ["p2", "p9"]; // solo p2 de los seleccionados es visible
    expect(countVisibleSelected(selected, visibleAhora)).toBe(1);
  });

  it("si todos los seleccionados son visibles, cuenta el total", () => {
    const selected = new Set(["p1", "p2"]);
    expect(countVisibleSelected(selected, ["p1", "p2", "p3"])).toBe(2);
  });
});

describe("bulk-selection - isEntireCatalogSelected (gate de confirmacion especial)", () => {
  it("verdadero solo cuando la seleccion coincide exactamente con TODO el catalogo", () => {
    const allIds = ["p1", "p2", "p3"];
    expect(isEntireCatalogSelected(new Set(allIds), allIds)).toBe(true);
    expect(isEntireCatalogSelected(new Set(["p1", "p2"]), allIds)).toBe(false);
  });

  it("catalogo vacio nunca cuenta como 'todo seleccionado'", () => {
    expect(isEntireCatalogSelected(new Set(), [])).toBe(false);
  });
});

describe("bulk-selection - toUniqueIdArray", () => {
  it("nunca produce IDs duplicados (Set garantiza unicidad)", () => {
    const selected = new Set(["p1", "p2"]);
    const array = toUniqueIdArray(selected);
    expect(array).toEqual(["p1", "p2"]);
    expect(new Set(array).size).toBe(array.length);
  });
});
