import { describe, expect, it } from "vitest";
import { buildBrandOptions, normalizeBrandForSave, findEquivalentBrand } from "@/lib/product-brand.ts";

describe("buildBrandOptions", () => {
  it("deriva marcas distintas desde el catalogo, ordenadas", () => {
    const options = buildBrandOptions(["Dior", "Carolina Herrera", "Versace"]);
    expect(options.map((o) => o.label)).toEqual(["Carolina Herrera", "Dior", "Versace"]);
  });

  it('"Dior", "DIOR" y " Dior " se tratan como la misma marca (una sola opcion)', () => {
    const options = buildBrandOptions(["Dior", "DIOR", " Dior "]);
    expect(options).toHaveLength(1);
    expect(options[0].label).toBe("Dior"); // conserva la primera variante encontrada
  });

  it("ignora vacios y nulos", () => {
    const options = buildBrandOptions(["Dior", "", null, undefined, "   "]);
    expect(options).toHaveLength(1);
  });
});

describe("normalizeBrandForSave", () => {
  it("SOLO recorta espacios, NUNCA cambia mayusculas/minusculas (marca nueva se guarda tal cual la escribio el admin)", () => {
    expect(normalizeBrandForSave("  dior  ")).toBe("dior");
    expect(normalizeBrandForSave("YVES SAINT LAURENT")).toBe("YVES SAINT LAURENT");
  });

  it('preserva siglas/mayusculas de marcas reales: "DKNY", "YSL", "BOSS" no se convierten a "Dkny"/"Ysl"/"Boss"', () => {
    expect(normalizeBrandForSave("DKNY")).toBe("DKNY");
    expect(normalizeBrandForSave("YSL")).toBe("YSL");
    expect(normalizeBrandForSave("BOSS")).toBe("BOSS");
    expect(normalizeBrandForSave("  CH  ")).toBe("CH");
  });

  it("colapsa espacios internos repetidos sin tocar la capitalizacion", () => {
    expect(normalizeBrandForSave("Carolina    Herrera")).toBe("Carolina Herrera");
    expect(normalizeBrandForSave("YVES   SAINT LAURENT")).toBe("YVES SAINT LAURENT");
  });

  it("cadena vacia da cadena vacia", () => {
    expect(normalizeBrandForSave("   ")).toBe("");
  });
});

describe("Flujo marca nueva vs. marca existente (formulario Agregar perfume)", () => {
  it('marca EXISTENTE: "Dior", "DIOR" y " Dior " deben resolver a la escritura canonica ya guardada ("Dior")', () => {
    const known = buildBrandOptions(["Dior", "Versace"]);
    for (const typed of ["Dior", "DIOR", " Dior "]) {
      const normalized = normalizeBrandForSave(typed);
      const equivalent = findEquivalentBrand(normalized, known);
      expect(equivalent?.label).toBe("Dior");
    }
  });

  it('marca NUEVA "DKNY": no hay equivalente conocido, se guarda exactamente "DKNY"', () => {
    const known = buildBrandOptions(["Dior", "Versace"]);
    const normalized = normalizeBrandForSave("DKNY");
    const equivalent = findEquivalentBrand(normalized, known);
    expect(equivalent).toBeNull();
    expect(normalized).toBe("DKNY");
  });

  it('marca NUEVA "YSL": se guarda exactamente "YSL"', () => {
    const known = buildBrandOptions(["Dior"]);
    const normalized = normalizeBrandForSave("YSL");
    expect(findEquivalentBrand(normalized, known)).toBeNull();
    expect(normalized).toBe("YSL");
  });

  it('marca NUEVA "BOSS": se guarda exactamente "BOSS"', () => {
    const known = buildBrandOptions(["Dior"]);
    const normalized = normalizeBrandForSave("BOSS");
    expect(findEquivalentBrand(normalized, known)).toBeNull();
    expect(normalized).toBe("BOSS");
  });

  it('marca DUPLICADA con espacios extra ("  boss  ") de una marca ya existente ("BOSS") se detecta como equivalente, no se crea un duplicado', () => {
    const known = buildBrandOptions(["BOSS", "Dior"]);
    const normalized = normalizeBrandForSave("  boss  ");
    const equivalent = findEquivalentBrand(normalized, known);
    expect(equivalent?.label).toBe("BOSS");
  });
});

describe("findEquivalentBrand (prevencion de duplicados equivalentes)", () => {
  it('encuentra "Dior" como equivalente de "DIOR" ya existente', () => {
    const known = buildBrandOptions(["Dior", "Versace"]);
    const match = findEquivalentBrand("DIOR", known);
    expect(match?.label).toBe("Dior");
  });

  it("no encuentra coincidencia para una marca genuinamente nueva", () => {
    const known = buildBrandOptions(["Dior", "Versace"]);
    expect(findEquivalentBrand("Chanel", known)).toBeNull();
  });

  it('" dior " (con espacios) tambien coincide', () => {
    const known = buildBrandOptions(["Dior"]);
    expect(findEquivalentBrand("  dior  ", known)?.label).toBe("Dior");
  });
});
