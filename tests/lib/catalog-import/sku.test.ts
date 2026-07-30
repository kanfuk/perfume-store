import { describe, expect, it } from "vitest";
import { buildSkuBase, assignDeterministicSkus } from "@/lib/catalog-import/sku.ts";

describe("catalog-import/sku - buildSkuBase", () => {
  it("es determinista: mismos datos producen el mismo SKU", () => {
    const a = buildSkuBase("Carolina Herrera", "La Bomba", "80ml");
    const b = buildSkuBase("Carolina Herrera", "La Bomba", "80ml");
    expect(a).toBe(b);
  });

  it("es ASCII, en mayusculas, sin tildes", () => {
    const sku = buildSkuBase("Yves Saint Lauren", "Sí passion pink fiori", "100 ml");
    expect(sku).toMatch(/^[A-Z0-9-]+$/);
    expect(sku).not.toMatch(/[íÍáÁéÉóÓúÚñÑ]/);
  });

  it("elimina puntuacion (ej. EST.67)", () => {
    const sku = buildSkuBase("Ralph Lauren", "Polo EST.67", "200ml");
    expect(sku).not.toContain(".");
  });

  it("incluye el contenido en el SKU y distingue contenidos diferentes", () => {
    const sku50 = buildSkuBase("Paco Rabanne", "Lady million", "50ml");
    const sku80 = buildSkuBase("Paco Rabanne", "Lady million", "80ml");
    expect(sku50).not.toBe(sku80);
    expect(sku50).toContain("50ML");
    expect(sku80).toContain("80ML");
  });

  it("no incluye timestamps ni UUID (mismo input -> mismo output en el tiempo)", () => {
    const first = buildSkuBase("Dior", "Sauvage", "100ml");
    const second = buildSkuBase("Dior", "Sauvage", "100ml");
    expect(first).toBe(second);
    expect(first).not.toMatch(/\d{10,}/);
  });
});

describe("catalog-import/sku - assignDeterministicSkus", () => {
  it("asigna SKU unicos a items sin colision", () => {
    const items = [
      { marca: "Dior", nombre: "Sauvage", contenido: "100ml" },
      { marca: "Dior", nombre: "Sauvage", contenido: "60ml" }
    ];
    const map = assignDeterministicSkus(items, (i) => i);
    const skus = items.map((i) => map.get(i));
    expect(new Set(skus).size).toBe(2);
  });

  it("agrega sufijo estable ante colision de SKU base, en orden de aparicion", () => {
    const items = [
      { marca: "X", nombre: "Y", contenido: "100 ml" },
      { marca: "X", nombre: "Y", contenido: "100ml" } // misma clave normalizada -> mismo SKU base
    ];
    const map = assignDeterministicSkus(items, (i) => i);
    expect(map.get(items[0])).toBe("SML-X-Y-100ML");
    expect(map.get(items[1])).toBe("SML-X-Y-100ML-2");
  });

  it("la asignacion es reproducible: mismo orden de entrada produce el mismo mapeo", () => {
    const items = [
      { marca: "A", nombre: "B", contenido: "10ml" },
      { marca: "A", nombre: "B", contenido: "10 ml" },
      { marca: "A", nombre: "B", contenido: "10ML" }
    ];
    const map1 = assignDeterministicSkus(items, (i) => i);
    const map2 = assignDeterministicSkus(items, (i) => i);
    expect([...map1.values()]).toEqual([...map2.values()]);
    expect([...map1.values()]).toEqual(["SML-A-B-10ML", "SML-A-B-10ML-2", "SML-A-B-10ML-3"]);
  });
});
