import { describe, expect, it } from "vitest";
import {
  normalizeDisplayText,
  normalizeMatchKey,
  normalizeContenido,
  buildReconciliationKey,
  levenshteinDistance,
  isLikelyTypoVariant,
  differsOnlyInLastToken,
  isConcentrationVariant
} from "@/lib/catalog-import/normalization.ts";

describe("catalog-import/normalization", () => {
  it("normalizeDisplayText unifica espacios y recorta bordes conservando tildes", () => {
    expect(normalizeDisplayText("  Léau   dissey  ")).toBe("Léau dissey");
  });

  it("normalizeMatchKey elimina tildes y pasa a minusculas", () => {
    expect(normalizeMatchKey("Sí passion pink fiori")).toBe("si passion pink fiori");
    expect(normalizeMatchKey("Si passion pink fiori")).toBe("si passion pink fiori");
  });

  it("normalizeContenido produce el mismo resultado para variantes de formato", () => {
    expect(normalizeContenido("100 ml")).toBe("100ML");
    expect(normalizeContenido("100ml")).toBe("100ML");
    expect(normalizeContenido(" 100 ML ")).toBe("100ML");
  });

  it("normalizeContenido nunca fusiona contenidos numericos distintos", () => {
    expect(normalizeContenido("30ml")).not.toBe(normalizeContenido("50ml"));
    expect(normalizeContenido("80ml")).not.toBe(normalizeContenido("100ml"));
  });

  it("buildReconciliationKey es estable ante puntuacion y espacios", () => {
    const a = buildReconciliationKey("Carolina Herrera", "La Bomba ", "80 ml ");
    const b = buildReconciliationKey("Carolina Herrera", "La Bomba", "80ml");
    expect(a).toBe(b);
  });

  it("levenshteinDistance calcula distancia de edicion clasica", () => {
    expect(levenshteinDistance("gato", "gato")).toBe(0);
    expect(levenshteinDistance("gato", "gata")).toBe(1);
    expect(levenshteinDistance("", "abc")).toBe(3);
  });

  it("isLikelyTypoVariant detecta variantes tipograficas cercanas", () => {
    expect(isLikelyTypoVariant("myslf eau de parfm", "myself eau de parfm")).toBe(true);
  });

  it("isLikelyTypoVariant no marca nombres claramente distintos", () => {
    expect(isLikelyTypoVariant("sauvage", "millesime imperial")).toBe(false);
  });

  it("isLikelyTypoVariant no marca dos strings identicos (no es una variante)", () => {
    expect(isLikelyTypoVariant("la bomba", "la bomba")).toBe(false);
  });

  it("differsOnlyInLastToken exige al menos 3 tokens compartidos antes del ultimo", () => {
    expect(differsOnlyInLastToken("212 heroes forever young", "212 heroes forever mujer")).toBe(true);
    // Solo 2 tokens (linea generica): no debe dar falso positivo entre lineas distintas.
    expect(differsOnlyInLastToken("polo blue", "polo est67")).toBe(false);
  });

  it("isConcentrationVariant reconoce descriptores de concentracion conocidos", () => {
    expect(isConcentrationVariant("sauvage parfum", "sauvage edt")).toBe(true);
    expect(isConcentrationVariant("sauvage parfum", "sauvage elixir")).toBe(true);
  });

  it("isConcentrationVariant no confunde nombres de linea distintos con concentraciones", () => {
    expect(isConcentrationVariant("polo blue", "polo est67")).toBe(false);
  });
});
