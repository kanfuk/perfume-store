import { describe, expect, it } from "vitest";
import {
  normalizeCustomerDisplayName,
  normalizeCustomerEmailKey,
  normalizeCustomerLookupValue,
  normalizeCustomerPhoneKey,
  normalizeCustomerRutKey
} from "@/lib/customers/identity";

describe("normalizeCustomerDisplayName", () => {
  it("ya no reescribe nombres a alias hardcodeados de clientes reales de Pauli Store", () => {
    // La version heredada de Pauli Store mapeaba estos valores a nombres
    // reales de clientes ("Patricia Diaz", "Loreto Lopez", "Pauli",
    // "Camila Montes"). Eso se elimino: ahora solo se recorta espacios.
    expect(normalizeCustomerDisplayName("paty")).toBe("paty");
    expect(normalizeCustomerDisplayName("Patricia")).toBe("Patricia");
    expect(normalizeCustomerDisplayName("loreto looez")).toBe("loreto looez");
    expect(normalizeCustomerDisplayName("yo")).toBe("yo");
    expect(normalizeCustomerDisplayName("  Camila Montes  ")).toBe("Camila Montes");
  });

  it("solo recorta espacios, no cambia el contenido del nombre", () => {
    expect(normalizeCustomerDisplayName("  Rodrigo Riedmann  ")).toBe("Rodrigo Riedmann");
  });
});

describe("normalizeCustomerLookupValue", () => {
  it("normaliza tildes, mayusculas y espacios para comparar nombres", () => {
    expect(normalizeCustomerLookupValue("José   Pérez")).toBe("jose perez");
  });
});

describe("claves de identidad por telefono, RUT y correo", () => {
  it("normaliza telefono a solo digitos", () => {
    expect(normalizeCustomerPhoneKey("+56 9 1234 5678")).toBe("56912345678");
  });

  it("normaliza RUT a digitos y verificador en mayuscula", () => {
    expect(normalizeCustomerRutKey("11.111.111-k")).toBe("11111111K");
  });

  it("normaliza correo a minusculas y sin espacios", () => {
    expect(normalizeCustomerEmailKey("  Rodrigo@Example.com ")).toBe("rodrigo@example.com");
  });
});
