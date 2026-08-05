import { describe, expect, it } from "vitest";
import {
  buildFamilyKey,
  groupProductsIntoFamilies,
  getVisibleFamilies,
  getDefaultVariant,
  getFamilyMinPrice,
  getFamilyMaxPrice,
  getFamilySearchHaystack,
  getAvailableFamilyBrands,
  filterAndSortFamilies,
  groupByFamilyKey,
  getTopFamilies,
  getSelectableVariants
} from "@/lib/product-families.ts";
import type { ProductRecord } from "@/lib/types";

function product(overrides: Partial<ProductRecord> & { id: string; nombre: string }): ProductRecord {
  return {
    marca: "Marca",
    contenido: "50ML",
    precioVenta: 10000,
    stockActual: 5,
    stockReservado: 0,
    activo: true,
    esTop: false,
    ...overrides
  };
}

describe("product-families - buildFamilyKey", () => {
  it("misma marca/nombre (sin importar tildes/mayusculas) produce la misma clave", () => {
    expect(buildFamilyKey("Paco Rabanne", "Lady million")).toBe(buildFamilyKey("PACO RABANNE", "Lady Million"));
  });

  it("no incluye el contenido en la clave", () => {
    const a = buildFamilyKey("Paco Rabanne", "Lady Million");
    expect(a).not.toContain("ml");
  });

  it("nombres distintos por un modificador de concentracion producen claves distintas", () => {
    expect(buildFamilyKey("Giorgio Armani", "Aqua di Gio Profondo")).not.toBe(
      buildFamilyKey("Giorgio Armani", "Aqua di Gio Profondo Parfum")
    );
    expect(buildFamilyKey("Dior", "Sauvage EDT")).not.toBe(buildFamilyKey("Dior", "Sauvage EDP"));
    expect(buildFamilyKey("Dior", "Sauvage Parfum")).not.toBe(buildFamilyKey("Dior", "Sauvage Elixir"));
  });
});

describe("product-families - groupProductsIntoFamilies", () => {
  it("caso obligatorio: Lady Million 30/50/80ML genera UNA familia con 3 variantes", () => {
    const products = [
      product({ id: "p30", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "30ML", sku: "SML-A-30ML", precioVenta: 33750, stockActual: 3 }),
      product({ id: "p50", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "50ML", sku: "SML-A-50ML", precioVenta: 47250, stockActual: 4 }),
      product({ id: "p80", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "80ML", sku: "SML-A-80ML", precioVenta: 67500, stockActual: 0 })
    ];

    const families = groupProductsIntoFamilies(products);
    expect(families).toHaveLength(1);
    expect(families[0].variants).toHaveLength(3);
    expect(families[0].marca).toBe("Paco Rabanne");
    expect(families[0].nombre).toBe("Lady Million");
  });

  it("cada variante conserva su propio productId, SKU, stock y precio", () => {
    const products = [
      product({ id: "p30", nombre: "Lady Million", contenido: "30ML", sku: "SKU-30", precioVenta: 1000, stockActual: 3 }),
      product({ id: "p50", nombre: "Lady Million", contenido: "50ML", sku: "SKU-50", precioVenta: 2000, stockActual: 4 })
    ];
    const [family] = groupProductsIntoFamilies(products);
    const v30 = family.variants.find((v) => v.contenido === "30ML")!;
    const v50 = family.variants.find((v) => v.contenido === "50ML")!;

    expect(v30.productId).toBe("p30");
    expect(v30.sku).toBe("SKU-30");
    expect(v30.stockActual).toBe(3);
    expect(v30.precioVenta).toBe(1000);
    expect(v50.productId).toBe("p50");
    expect(v50.sku).toBe("SKU-50");
    expect(v50.stockActual).toBe(4);
    expect(v50.precioVenta).toBe(2000);
  });

  it("conserva esOfertaSemana por variante (Fase 7.4A: necesario para no mostrar precio tachado fuera de una oferta real)", () => {
    const products = [
      product({ id: "p1", nombre: "X", esOfertaSemana: true, precioAnterior: 90000, precioVenta: 65000 }),
      product({ id: "p2", nombre: "Y", esOfertaSemana: false, precioAnterior: 90000, precioVenta: 65000 })
    ];
    const [familyX] = groupProductsIntoFamilies([products[0]]);
    const [familyY] = groupProductsIntoFamilies([products[1]]);
    expect(familyX.variants[0].esOfertaSemana).toBe(true);
    expect(familyY.variants[0].esOfertaSemana).toBe(false);
  });

  it("ordena variantes por contenido numerico ascendente", () => {
    const products = [
      product({ id: "p200", nombre: "X", contenido: "200ML" }),
      product({ id: "p30", nombre: "X", contenido: "30ML" }),
      product({ id: "p100", nombre: "X", contenido: "100ML" }),
      product({ id: "p50", nombre: "X", contenido: "50ML" })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(family.variants.map((v) => v.contenido)).toEqual(["30ML", "50ML", "100ML", "200ML"]);
  });

  it("valores de contenido no numericos quedan al final", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "estuche" }),
      product({ id: "p2", nombre: "X", contenido: "50ML" })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(family.variants[0].contenido).toBe("50ML");
    expect(family.variants[1].contenido).toBe("estuche");
  });

  it("EDT y EDP no se agrupan (quedan como familias distintas)", () => {
    const products = [
      product({ id: "p1", nombre: "Sauvage EDT", marca: "Dior" }),
      product({ id: "p2", nombre: "Sauvage EDP", marca: "Dior" })
    ];
    const families = groupProductsIntoFamilies(products);
    expect(families).toHaveLength(2);
  });

  it("Parfum y Elixir no se agrupan", () => {
    const products = [
      product({ id: "p1", nombre: "Sauvage Parfum", marca: "Dior" }),
      product({ id: "p2", nombre: "Sauvage Elixir", marca: "Dior" })
    ];
    expect(groupProductsIntoFamilies(products)).toHaveLength(2);
  });

  it("caso obligatorio: familia Aqua di Gio Profondo no se agrupa con sus variantes de concentracion", () => {
    const products = [
      product({ id: "p1", nombre: "Aqua di Gio Profondo", marca: "Giorgio Armani", contenido: "125ML" }),
      product({ id: "p2", nombre: "Aqua di Gio Profondo Parfum", marca: "Giorgio Armani", contenido: "125ML" }),
      product({ id: "p3", nombre: "Aqua di Gio Profondo Eau de Parfum", marca: "Giorgio Armani", contenido: "125ML" }),
      product({ id: "p4", nombre: "Aqua di Gio Parfum", marca: "Giorgio Armani", contenido: "125ML" })
    ];
    const families = groupProductsIntoFamilies(products);
    expect(families).toHaveLength(4);
  });

  it("no usa similitud difusa: nombres levemente distintos no se agrupan aunque parezcan el mismo producto", () => {
    const products = [
      product({ id: "p1", nombre: "Bright Crystal", marca: "Versace" }),
      product({ id: "p2", nombre: "Bright Crystal EDT", marca: "Versace" })
    ];
    expect(groupProductsIntoFamilies(products)).toHaveLength(2);
  });

  it("resuelve la imagen: primero variante disponible con imagen, luego cualquier variante con imagen", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "30ML", stockActual: 0, activo: false, imageUrl: "/agotado.webp" }),
      product({ id: "p2", nombre: "X", contenido: "50ML", stockActual: 2, activo: true, imageUrl: "/disponible.webp" })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(family.imageUrl).toBe("/disponible.webp");
  });

  it("si ninguna variante disponible tiene imagen, usa la primera imagen de cualquier variante", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "30ML", stockActual: 0, activo: false, imageUrl: "/unica.webp" }),
      product({ id: "p2", nombre: "X", contenido: "50ML", stockActual: 2, activo: true, imageUrl: undefined })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(family.imageUrl).toBe("/unica.webp");
  });
});

describe("product-families - disponibilidad", () => {
  it("variante agotada o inactiva queda marcada como no disponible", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "30ML", stockActual: 0 }),
      product({ id: "p2", nombre: "X", contenido: "50ML", activo: false, stockActual: 5 })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(family.variants.every((v) => !v.disponible)).toBe(true);
  });

  it("familia sin ninguna variante disponible se oculta del catalogo publico", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "30ML", stockActual: 0 }),
      product({ id: "p2", nombre: "Y", contenido: "50ML", stockActual: 3 })
    ];
    const families = groupProductsIntoFamilies(products);
    const visible = getVisibleFamilies(families);
    expect(visible).toHaveLength(1);
    expect(visible[0].nombre).toBe("Y");
  });

  it("getDefaultVariant selecciona la disponible de menor contenido", () => {
    const products = [
      product({ id: "p30", nombre: "X", contenido: "30ML", stockActual: 0 }),
      product({ id: "p50", nombre: "X", contenido: "50ML", stockActual: 4 }),
      product({ id: "p80", nombre: "X", contenido: "80ML", stockActual: 2 })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(getDefaultVariant(family).productId).toBe("p50");
  });
});

describe("product-families - getSelectableVariants (pausados vs sin stock, Fase 2B.10)", () => {
  it("una variante pausada (activo=false) queda excluida por completo del selector publico", () => {
    const products = [
      product({ id: "p30", nombre: "X", contenido: "30ML", activo: true, stockActual: 3 }),
      product({ id: "p80", nombre: "X", contenido: "80ML", activo: false, stockActual: 5 }) // pausada
    ];
    const [family] = groupProductsIntoFamilies(products);
    const selectable = getSelectableVariants(family);
    expect(selectable.map((v) => v.productId)).toEqual(["p30"]);
  });

  it("una variante activa sin stock SI aparece en el selector, pero deshabilitada (no disponible)", () => {
    const products = [
      product({ id: "p30", nombre: "X", contenido: "30ML", activo: true, stockActual: 0 }),
      product({ id: "p80", nombre: "X", contenido: "80ML", activo: true, stockActual: 5 })
    ];
    const [family] = groupProductsIntoFamilies(products);
    const selectable = getSelectableVariants(family);
    expect(selectable.map((v) => v.productId)).toEqual(["p30", "p80"]);
    expect(selectable.find((v) => v.productId === "p30")!.disponible).toBe(false);
  });

  it("getDefaultVariant nunca preselecciona una variante pausada", () => {
    const products = [
      product({ id: "p30", nombre: "X", contenido: "30ML", activo: false, stockActual: 10 }), // pausada, con stock
      product({ id: "p80", nombre: "X", contenido: "80ML", activo: true, stockActual: 0 }) // activa pero sin stock
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(getDefaultVariant(family).productId).toBe("p80");
  });

  it("getFamilyMinPrice/getFamilyMaxPrice ignoran variantes pausadas", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "30ML", precioVenta: 1000, activo: false, stockActual: 5 }), // pausada, barata
      product({ id: "p2", nombre: "X", contenido: "50ML", precioVenta: 5000, activo: true, stockActual: 3 })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(getFamilyMinPrice(family)).toBe(5000);
    expect(getFamilyMaxPrice(family)).toBe(5000);
  });

  it("getFamilySearchHaystack no expone el contenido/SKU de variantes pausadas", () => {
    const products = [
      product({ id: "p1", nombre: "X", marca: "Y", contenido: "80ML", sku: "SKU-PAUSADA", activo: false, stockActual: 5 })
    ];
    const [family] = groupProductsIntoFamilies(products);
    const haystack = getFamilySearchHaystack(family).toLowerCase();
    expect(haystack).not.toContain("80ml");
    expect(haystack).not.toContain("sku-pausada");
  });

  it("familia con todas las variantes pausadas o sin stock se oculta del catalogo publico", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "30ML", activo: false, stockActual: 10 }), // pausada
      product({ id: "p2", nombre: "X", contenido: "50ML", activo: true, stockActual: 0 }), // sin stock
      product({ id: "p3", nombre: "Y", contenido: "50ML", activo: true, stockActual: 4 })
    ];
    const families = groupProductsIntoFamilies(products);
    const visible = getVisibleFamilies(families);
    expect(visible.map((f) => f.nombre)).toEqual(["Y"]);
  });
});

describe("product-families - precios y busqueda", () => {
  it("getFamilyMinPrice/getFamilyMaxPrice usan solo variantes disponibles cuando existen", () => {
    const products = [
      product({ id: "p1", nombre: "X", contenido: "30ML", precioVenta: 1000, stockActual: 0 }),
      product({ id: "p2", nombre: "X", contenido: "50ML", precioVenta: 2000, stockActual: 3 }),
      product({ id: "p3", nombre: "X", contenido: "80ML", precioVenta: 3000, stockActual: 5 })
    ];
    const [family] = groupProductsIntoFamilies(products);
    expect(getFamilyMinPrice(family)).toBe(2000); // ignora la agotada de 1000
    expect(getFamilyMaxPrice(family)).toBe(3000);
  });

  it("getFamilySearchHaystack incluye nombre, marca y contenido de cada variante", () => {
    const products = [
      product({ id: "p1", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "80ML" })
    ];
    const [family] = groupProductsIntoFamilies(products);
    const haystack = getFamilySearchHaystack(family).toLowerCase();
    expect(haystack).toContain("lady million");
    expect(haystack).toContain("paco rabanne");
    expect(haystack).toContain("80ml");
  });
});

describe("product-families - filterAndSortFamilies / getAvailableFamilyBrands", () => {
  function families() {
    return groupProductsIntoFamilies([
      product({ id: "lm30", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "30ML", precioVenta: 33750, stockActual: 3 }),
      product({ id: "lm80", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "80ML", precioVenta: 67500, stockActual: 2 }),
      product({ id: "bomba", nombre: "La Bomba", marca: "Carolina Herrera", contenido: "80ML", precioVenta: 65000, stockActual: 5 })
    ]);
  }

  it("busqueda por contenido de cualquiera de sus variantes encuentra la familia", () => {
    const result = filterAndSortFamilies(families(), { query: "30ML" });
    expect(result.map((f) => f.nombre)).toEqual(["Lady Million"]);
  });

  it("busqueda por nombre/marca funciona igual que antes", () => {
    expect(filterAndSortFamilies(families(), { query: "bomba" }).map((f) => f.nombre)).toEqual(["La Bomba"]);
    expect(filterAndSortFamilies(families(), { query: "carolina herrera" }).map((f) => f.nombre)).toEqual(["La Bomba"]);
  });

  it("filtra por marca exacta", () => {
    const result = filterAndSortFamilies(families(), { brand: "Paco Rabanne" });
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe("Lady Million");
  });

  it("ordena por menor precio usando el precio minimo disponible de la familia", () => {
    const result = filterAndSortFamilies(families(), { sort: "precio-asc" });
    expect(result.map((f) => f.nombre)).toEqual(["Lady Million", "La Bomba"]); // 33750 < 65000
  });

  it("ordena por mayor precio usando el precio maximo disponible de la familia", () => {
    const result = filterAndSortFamilies(families(), { sort: "precio-desc" });
    expect(result.map((f) => f.nombre)).toEqual(["Lady Million", "La Bomba"]); // 67500 > 65000
  });

  it("ordena por nombre A-Z usando el nombre de la familia", () => {
    const result = filterAndSortFamilies(families(), { sort: "nombre-asc" });
    expect(result.map((f) => f.nombre)).toEqual(["La Bomba", "Lady Million"]);
  });

  it("getAvailableFamilyBrands devuelve marcas unicas ordenadas", () => {
    expect(getAvailableFamilyBrands(families())).toEqual(["Carolina Herrera", "Paco Rabanne"]);
  });
});

describe("product-families - groupByFamilyKey (agrupacion visual generica)", () => {
  it("agrupa items por marca+nombre preservando el orden de aparicion", () => {
    const groups = groupByFamilyKey([
      { nombre: "Lady Million", marca: "Paco Rabanne", contenido: "30ML" },
      { nombre: "La Bomba", marca: "Carolina Herrera", contenido: "80ML" },
      { nombre: "Lady Million", marca: "Paco Rabanne", contenido: "50ML" }
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].nombre).toBe("Lady Million");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].nombre).toBe("La Bomba");
    expect(groups[1].items).toHaveLength(1);
  });

  it("no fusiona ni modifica los items originales: cada uno conserva sus propios campos", () => {
    const groups = groupByFamilyKey([
      { nombre: "Lady Million", marca: "Paco Rabanne", sku: "SKU-30" },
      { nombre: "Lady Million", marca: "Paco Rabanne", sku: "SKU-50" }
    ]);
    expect(groups[0].items.map((i) => i.sku)).toEqual(["SKU-30", "SKU-50"]);
  });
});

describe("product-families - getTopFamilies (Top 12 por familia)", () => {
  it("caso obligatorio: dos variantes de la misma familia en posiciones distintas colapsan en UNA sola entrada", () => {
    const families = groupProductsIntoFamilies([
      product({ id: "lm30", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "30ML", esTop: true, ordenDestacado: 7 }),
      product({ id: "lm80", nombre: "Lady Million", marca: "Paco Rabanne", contenido: "80ML", esTop: true, ordenDestacado: 3 }),
      product({ id: "otro", nombre: "Otro Perfume", marca: "Otra Marca", esTop: true, ordenDestacado: 1 })
    ]);

    const top = getTopFamilies(families, 12);
    expect(top).toHaveLength(2);
    const ladyMillion = top.find((t) => t.family.nombre === "Lady Million")!;
    expect(ladyMillion.rank).toBe(3); // la mejor posicion (numero menor) gana
    expect(ladyMillion.initialVariantId).toBe("lm80"); // la variante de esa posicion queda preseleccionada
  });

  it("respeta el limite y el orden por ranking", () => {
    const families = groupProductsIntoFamilies([
      product({ id: "p1", nombre: "A", esTop: true, ordenDestacado: 2 }),
      product({ id: "p2", nombre: "B", esTop: true, ordenDestacado: 1 })
    ]);
    const top = getTopFamilies(families, 1);
    expect(top).toHaveLength(1);
    expect(top[0].family.nombre).toBe("B");
  });

  it("ignora familias sin ninguna variante marcada esTop", () => {
    const families = groupProductsIntoFamilies([product({ id: "p1", nombre: "A", esTop: false })]);
    expect(getTopFamilies(families, 12)).toHaveLength(0);
  });
});
