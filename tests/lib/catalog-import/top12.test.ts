import { describe, expect, it } from "vitest";
import { associateTop12, buildTop12ImageEntries } from "@/lib/catalog-import/top12.ts";
import type { CanonicalProduct, ReconciledEntry, Top12RankingItem } from "@/lib/catalog-import/types.ts";

function product(overrides: Partial<CanonicalProduct> = {}): CanonicalProduct {
  return {
    sku: "SML-TEST-1",
    nombre: "La Bomba",
    marca: "Carolina Herrera",
    contenido: "80ML",
    costoUnitario: 45000,
    precioVenta: 65000,
    stock: null,
    activo: false,
    esTop: false,
    ordenDestacado: null,
    esOfertaSemana: false,
    precioAnterior: null,
    imageUrl: null,
    origenCosto: "julio",
    origenPrecio: "junio",
    estadoDatos: "FALTA_STOCK",
    observacionesImportacion: "",
    classification: "MATCH_EXACTO",
    ...overrides
  };
}

describe("catalog-import/top12 - associateTop12", () => {
  it("MATCH_CONFIRMADO cuando marca+nombre coinciden exactamente con un unico producto", () => {
    const ranking: Top12RankingItem[] = [{ rank: 3, marca: "Carolina Herrera", nombre: "La Bomba" }];
    const products = [product()];
    const result = associateTop12(ranking, products, []);
    expect(result.get(3)?.status).toBe("MATCH_CONFIRMADO");
    expect(result.get(3)?.sku).toBe("SML-TEST-1");
  });

  it("SIN_MATCH_EN_PLANILLAS cuando no hay ningun candidato razonable", () => {
    const ranking: Top12RankingItem[] = [{ rank: 9, marca: "Creed", nombre: "Millesime Imperial" }];
    const products = [product()];
    const result = associateTop12(ranking, products, []);
    expect(result.get(9)?.status).toBe("SIN_MATCH_EN_PLANILLAS");
  });

  it("CANDIDATO_UNICO_NO_CONFIRMADO cuando hay exactamente una variante tipografica cercana", () => {
    const ranking: Top12RankingItem[] = [
      { rank: 10, marca: "Giorgio Armani", nombre: "Acqua di Gio Profondo Parfum" }
    ];
    const products = [
      product({
        sku: "SML-GA-1",
        nombre: "Aqua di gio Profondo Parfum",
        marca: "Giorgio Armani",
        contenido: "125ML"
      })
    ];
    const result = associateTop12(ranking, products, []);
    expect(result.get(10)?.status).toBe("CANDIDATO_UNICO_NO_CONFIRMADO");
  });

  it("AMBIGUO cuando hay 2+ candidatos plausibles (misma fragancia, distinta concentracion)", () => {
    const ranking: Top12RankingItem[] = [{ rank: 11, marca: "Christian Dior", nombre: "Sauvage Parfum" }];
    const products = [
      product({ sku: "SML-DIOR-EDT", nombre: "Sauvage EDT", marca: "Christian Dior", contenido: "100ML" }),
      product({ sku: "SML-DIOR-ELIXIR", nombre: "Sauvage Elixir", marca: "Christian Dior", contenido: "100ML" })
    ];
    const result = associateTop12(ranking, products, []);
    expect(result.get(11)?.status).toBe("AMBIGUO");
    expect(result.get(11)?.candidates).toHaveLength(2);
  });

  it("nunca asigna es_top a mas de un producto para el mismo rank (maximo 1 SKU por rank)", () => {
    const ranking: Top12RankingItem[] = [{ rank: 3, marca: "Carolina Herrera", nombre: "La Bomba" }];
    const products = [product()];
    const result = associateTop12(ranking, products, []);
    expect(result.size).toBe(1);
  });

  it("busca candidatos tambien entre entradas AMBIGUO de la reconciliacion (pendientes de conciliar)", () => {
    const ranking: Top12RankingItem[] = [
      { rank: 8, marca: "Yves Saint Laurent", nombre: "MYSLF Eau de Parfum" }
    ];
    const ambiguousEntries: ReconciledEntry[] = [
      {
        classification: "AMBIGUO",
        key: "x",
        julioRow: {
          sheet: "julio",
          rowNumber: 48,
          perfume: "Myslf Eau de parfm",
          marca: "Yves Saint Lauren",
          contenido: "100 ml"
        },
        junioRow: {
          sheet: "junio",
          rowNumber: 53,
          perfume: "Myself Eau de parfm",
          marca: "Yves Saint Lauren",
          contenido: "100 ml"
        }
      }
    ];
    const result = associateTop12(ranking, [], ambiguousEntries);
    expect(result.get(8)?.status).toBe("AMBIGUO");
    expect(result.get(8)?.candidates.length).toBeGreaterThan(0);
  });
});

describe("catalog-import/top12 - buildTop12ImageEntries", () => {
  it("solo aplica canonicalSku/canonicalName/canonicalBrand cuando el match es confirmado", () => {
    const ranking: Top12RankingItem[] = [
      { rank: 1, marca: "Carolina Herrera", nombre: "La Bomba" },
      { rank: 2, marca: "Creed", nombre: "Millesime Imperial" }
    ];
    const images = [
      { rank: 1, sourceFile: "a.jpg", sourceSha256: "hash-a", imageUrl: "/top-01.webp" },
      { rank: 2, sourceFile: "b.jpg", sourceSha256: "hash-b", imageUrl: "/top-02.webp" }
    ];
    const products = [product()];

    const entries = buildTop12ImageEntries(ranking, images, products, []);

    expect(entries[0].matchStatus).toBe("MATCH_CONFIRMADO");
    expect(entries[0].canonicalSku).toBe("SML-TEST-1");

    expect(entries[1].matchStatus).toBe("SIN_MATCH_EN_PLANILLAS");
    expect(entries[1].canonicalSku).toBeNull();
    expect(entries[1].canonicalName).toBeNull();
    expect(entries[1].canonicalBrand).toBeNull();
  });
});
