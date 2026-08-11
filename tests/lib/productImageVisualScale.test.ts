import { describe, expect, it } from "vitest";
import { clampVisualScale, getProductImageVisualScale } from "@/lib/product-image-visual-scale";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Cobertura de la tabla de zoom visual por producto (ver
 * lib/product-image-visual-scale.ts): mecanismo de presentacion adoptado
 * DESPUES de comprobar con datos reales que sharp().trim() no tenia
 * ningun efecto sobre las fotos de este catalogo (0 diferencia de bytes/
 * dimensiones en 6 productos verificados). No toca Supabase, no modifica
 * la imagen original, y esta acotado a un maximo conservador para nunca
 * recortar el producto mismo con un zoom agresivo.
 */

const SAUVAGE_ID = "b136fac2-562b-4fd3-a88f-082db35d6d95";
const LE_MALE_ID = "8cdfc4c4-0678-4bce-941c-51fbfa35245d";
const LE_BEAU_ID = "dd93ed8e-1f24-447b-82cc-fbc38f115290";
const INVICTUS_ID = "7c6db73a-54f5-4343-a4f6-2e449dfa8926";
const LA_BOMBA_ID = "e68675f0-f85c-4dd4-8822-71217b1a7287";
const LA_VIE_ID = "c8143b52-c9a0-4351-9e5e-af3424fe9c2d";

describe("getProductImageVisualScale", () => {
  it("producto sin entrada en la tabla: 1 (sin cambios)", () => {
    expect(getProductImageVisualScale("producto-no-configurado")).toBe(1);
  });

  it("id vacio/undefined/null: 1 (sin cambios), nunca lanza", () => {
    expect(getProductImageVisualScale(undefined)).toBe(1);
    expect(getProductImageVisualScale(null)).toBe(1);
    expect(getProductImageVisualScale("")).toBe(1);
  });

  it("devuelve el valor configurado para cada uno de los 6 productos verificados", () => {
    expect(getProductImageVisualScale(SAUVAGE_ID)).toBe(1.05);
    expect(getProductImageVisualScale(LE_MALE_ID)).toBe(1.1);
    expect(getProductImageVisualScale(LE_BEAU_ID)).toBe(1.05);
    expect(getProductImageVisualScale(INVICTUS_ID)).toBe(1.1);
    expect(getProductImageVisualScale(LA_BOMBA_ID)).toBe(1.15);
    expect(getProductImageVisualScale(LA_VIE_ID)).toBe(1.15);
  });

  it("ningun valor configurado supera el tope de seguridad (1.35): nunca un zoom agresivo", () => {
    const ids = [SAUVAGE_ID, LE_MALE_ID, LE_BEAU_ID, INVICTUS_ID, LA_BOMBA_ID, LA_VIE_ID];
    for (const id of ids) {
      const scale = getProductImageVisualScale(id);
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale).toBeLessThanOrEqual(1.35);
    }
  });
});

describe("clampVisualScale", () => {
  it("un valor por encima del tope se recorta a 1.35", () => {
    expect(clampVisualScale(2)).toBe(1.35);
    expect(clampVisualScale(1.5)).toBe(1.35);
  });

  it("un valor dentro del rango seguro no se toca", () => {
    expect(clampVisualScale(1.1)).toBe(1.1);
  });

  it("un valor menor a 1 (encogimiento) se rechaza y vuelve a 1", () => {
    expect(clampVisualScale(0.8)).toBe(1);
  });

  it("valores no finitos (NaN/Infinity) nunca rompen: vuelven a 1", () => {
    expect(clampVisualScale(NaN)).toBe(1);
    expect(clampVisualScale(Infinity)).toBe(1);
  });
});
