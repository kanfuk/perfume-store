import { describe, expect, it } from "vitest";
import { resolveCardMetadata } from "@/lib/product-card-metadata.ts";

describe("product-card-metadata - resolveCardMetadata (Fase 2B.13, tarjetas uniformes)", () => {
  it("con marca y contenido: ambas lineas se muestran", () => {
    const result = resolveCardMetadata({ marca: "Paco Rabanne", contenido: "80ML" });
    expect(result).toEqual({ hasBrand: true, brandLabel: "Paco Rabanne", hasContent: true, contentLabel: "80ML" });
  });

  it("sin marca: hasBrand es false y brandLabel queda vacio (nunca 'undefined'/'null')", () => {
    const result = resolveCardMetadata({ marca: undefined, contenido: "80ML" });
    expect(result.hasBrand).toBe(false);
    expect(result.brandLabel).toBe("");
    expect(result.brandLabel).not.toMatch(/undefined|null/i);
  });

  it("sin contenido: hasContent es false y contentLabel queda vacio (nunca '0ML'/'SIN DATO')", () => {
    const result = resolveCardMetadata({ marca: "Paco Rabanne", contenido: "" });
    expect(result.hasContent).toBe(false);
    expect(result.contentLabel).toBe("");
    expect(result.contentLabel).not.toMatch(/0ML|SIN DATO/i);
  });

  it("sin marca ni contenido: ambas banderas quedan en false, nunca lanza", () => {
    const result = resolveCardMetadata({ marca: null, contenido: null });
    expect(result.hasBrand).toBe(false);
    expect(result.hasContent).toBe(false);
  });

  it("marca/contenido solo con espacios se tratan como ausentes (trim)", () => {
    const result = resolveCardMetadata({ marca: "   ", contenido: "  " });
    expect(result.hasBrand).toBe(false);
    expect(result.hasContent).toBe(false);
  });

  it("el resultado siempre tiene la misma forma (4 campos) sin importar los datos de entrada", () => {
    const casos = [
      { marca: "Marca", contenido: "50ML" },
      { marca: undefined, contenido: "50ML" },
      { marca: "Marca", contenido: undefined },
      { marca: undefined, contenido: undefined }
    ];
    for (const caso of casos) {
      const result = resolveCardMetadata(caso);
      expect(Object.keys(result).sort()).toEqual(["brandLabel", "contentLabel", "hasBrand", "hasContent"]);
    }
  });
});
