import { describe, expect, it } from "vitest";
import {
  CHILEAN_ACCOUNT_TYPES,
  OTRA_CUENTA_VALUE,
  findChileanAccountTypeLabel
} from "@/config/chileanAccountTypes";

describe("catalogo de tipos de cuenta", () => {
  it("usa values unicos", () => {
    const values = CHILEAN_ACCOUNT_TYPES.map((type) => type.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("incluye los tipos comerciales y deja Otra al final", () => {
    expect(findChileanAccountTypeLabel("CUENTA_CORRIENTE")).toBe("Cuenta corriente");
    expect(findChileanAccountTypeLabel("CUENTA_RUT")).toBe("Cuenta RUT");
    expect(CHILEAN_ACCOUNT_TYPES.at(-1)?.value).toBe(OTRA_CUENTA_VALUE);
  });
});
