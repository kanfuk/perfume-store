import { describe, expect, it } from "vitest";
import {
  CHILEAN_BANKS,
  OTRO_BANCO_VALUE,
  findChileanBankLabel,
  isChileanBankValue
} from "@/config/chileanBanks";

describe("catalogo de bancos chilenos", () => {
  it("usa values unicos y estables", () => {
    const values = CHILEAN_BANKS.map((bank) => bank.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain("BANCOESTADO");
    expect(values).toContain("BCI");
  });

  it("deja Otro banco al final", () => {
    expect(CHILEAN_BANKS.at(-1)?.value).toBe(OTRO_BANCO_VALUE);
  });

  it("mantiene labels comerciales y nombres normalizados", () => {
    expect(findChileanBankLabel("BANCOESTADO")).toBe("BancoEstado");
    expect(CHILEAN_BANKS.every((bank) => bank.label.trim() && bank.normalizedName.trim())).toBe(
      true
    );
  });

  it("rechaza valores fuera del catalogo", () => {
    expect(isChileanBankValue("BANCO_INVENTADO")).toBe(false);
  });
});
