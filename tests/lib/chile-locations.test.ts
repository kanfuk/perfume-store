import { describe, expect, it } from "vitest";
import {
  CHILE_REGIONS,
  getCommunesForRegion,
  isValidChileCommuneForRegion,
  isValidChileRegion,
  updateChileRegionSelection
} from "@/lib/chile-locations";

describe("catálogo de regiones y comunas de Chile", () => {
  it("incluye las 16 regiones vigentes", () => {
    expect(CHILE_REGIONS).toHaveLength(16);
    expect(isValidChileRegion("Región Metropolitana de Santiago")).toBe(true);
  });

  it("entrega solo comunas de la región seleccionada", () => {
    const communes = getCommunesForRegion("Región de Valparaíso");

    expect(communes).toContain("Viña del Mar");
    expect(communes).not.toContain("Providencia");
  });

  it("valida una comuna compatible con su región", () => {
    expect(
      isValidChileCommuneForRegion("Región Metropolitana de Santiago", "Providencia")
    ).toBe(true);
  });

  it("rechaza una comuna incompatible con su región", () => {
    expect(isValidChileCommuneForRegion("Región de Valparaíso", "Providencia")).toBe(false);
  });

  it("limpia la comuna al cambiar de región y conserva el contrato del payload", () => {
    const currentPayload = {
      nombre: "Cliente",
      region: "Región Metropolitana de Santiago",
      comuna: "Providencia"
    };

    const nextPayload = updateChileRegionSelection(currentPayload, "Región de Valparaíso");

    expect(nextPayload).toEqual({
      nombre: "Cliente",
      region: "Región de Valparaíso",
      comuna: ""
    });
    expect(Object.keys(nextPayload)).toEqual(["nombre", "region", "comuna"]);
  });
});
