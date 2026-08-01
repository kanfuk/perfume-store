import { describe, expect, it } from "vitest";
import {
  businessPaymentSettingsToFormInput,
  getBusinessPaymentSettingsCompleteness,
  isBusinessPaymentSettingsComplete,
  maskAccountNumber,
  missingBusinessPaymentSettingsFields,
  resolveAccountTypeDisplayName,
  resolveBankDisplayName,
  validateBusinessPaymentSettings,
  type BusinessPaymentSettingsFormInput
} from "@/lib/businessPaymentSettings";

const validInput: BusinessPaymentSettingsFormInput = {
  banco: "BANCOESTADO",
  tipoCuenta: "CUENTA_VISTA",
  titularCuenta: "  Smellme SpA  ",
  rutTitular: "12.345.678-5",
  numeroCuenta: "0012345678",
  correo: "  PAGOS@SMELLME.CL "
};

describe("validateBusinessPaymentSettings", () => {
  it("normaliza titular, RUT y correo sin convertir la cuenta a numero", () => {
    const result = validateBusinessPaymentSettings(validInput);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.data.titularCuenta).toBe("Smellme SpA");
    expect(result.data.rutTitular).toBe("12345678-5");
    expect(result.data.correo).toBe("pagos@smellme.cl");
    expect(result.data.numeroCuenta).toBe("0012345678");
  });

  it("rechaza campos vacios", () => {
    const result = validateBusinessPaymentSettings({
      banco: "",
      tipoCuenta: "",
      titularCuenta: "",
      rutTitular: "",
      numeroCuenta: "",
      correo: ""
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(Object.keys(result.errors)).toEqual(
      expect.arrayContaining([
        "banco",
        "tipoCuenta",
        "titularCuenta",
        "rutTitular",
        "numeroCuenta",
        "correo"
      ])
    );
  });

  it("rechaza RUT invalido", () => {
    const result = validateBusinessPaymentSettings({
      ...validInput,
      rutTitular: "12.345.678-9"
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.rutTitular).toBeDefined();
  });

  it("rechaza banco y tipo fuera de catalogo", () => {
    const bank = validateBusinessPaymentSettings({
      ...validInput,
      banco: "BANCO_INVENTADO"
    });
    const account = validateBusinessPaymentSettings({
      ...validInput,
      tipoCuenta: "CUENTA_INVENTADA"
    });
    expect(bank.valid).toBe(false);
    expect(account.valid).toBe(false);
  });

  it("exige descripcion para Otro banco", () => {
    const result = validateBusinessPaymentSettings({
      ...validInput,
      banco: "OTRO_BANCO",
      bancoOtro: ""
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.bancoOtro).toBeDefined();
  });

  it("persiste el texto libre de Otro banco", () => {
    const result = validateBusinessPaymentSettings({
      ...validInput,
      banco: "OTRO_BANCO",
      bancoOtro: "Cooperativa de prueba"
    });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.banco).toBe("Cooperativa de prueba");
  });

  it("exige descripcion para Otra cuenta", () => {
    const result = validateBusinessPaymentSettings({
      ...validInput,
      tipoCuenta: "OTRA",
      tipoCuentaOtro: ""
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.tipoCuentaOtro).toBeDefined();
  });

  it("rechaza correo invalido", () => {
    const result = validateBusinessPaymentSettings({
      ...validInput,
      correo: "correo-invalido"
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.correo).toBeDefined();
  });
});

describe("helpers de configuracion de pago", () => {
  it("reconstruye las opciones Otro desde valores persistidos libres", () => {
    const form = businessPaymentSettingsToFormInput({
      banco: "Cooperativa de prueba",
      tipoCuenta: "Cuenta digital",
      titularCuenta: "Smellme SpA",
      rutTitular: "12345678-5",
      numeroCuenta: "0012",
      correo: "pagos@smellme.cl"
    });
    expect(form.banco).toBe("OTRO_BANCO");
    expect(form.bancoOtro).toBe("Cooperativa de prueba");
    expect(form.tipoCuenta).toBe("OTRA");
    expect(form.tipoCuentaOtro).toBe("Cuenta digital");
  });

  it("considera completa solo una configuracion que vuelve a validar", () => {
    expect(
      isBusinessPaymentSettingsComplete({
        banco: "BANCOESTADO",
        tipoCuenta: "CUENTA_VISTA",
        titularCuenta: "Smellme SpA",
        rutTitular: "12345678-5",
        numeroCuenta: "0012",
        correo: "pagos@smellme.cl"
      })
    ).toBe(true);
    expect(
      isBusinessPaymentSettingsComplete({
        banco: "BANCOESTADO",
        tipoCuenta: "CUENTA_VISTA",
        titularCuenta: "Smellme SpA",
        rutTitular: "RUT INVALIDO",
        numeroCuenta: "0012",
        correo: "pagos@smellme.cl"
      })
    ).toBe(false);
  });

  it("enumera faltantes y enmascara la cuenta", () => {
    expect(missingBusinessPaymentSettingsFields(null)).toHaveLength(6);
    expect(maskAccountNumber("0012345678")).toBe("••••••5678");
    expect(maskAccountNumber("0012")).toBe("••••");
  });

  it("expone para QA solo booleanos de completitud por categoría", () => {
    expect(getBusinessPaymentSettingsCompleteness({
      banco: "BANCO_DE_PRUEBA",
      tipoCuenta: "TIPO_DE_PRUEBA",
      numeroCuenta: "CUENTA_DE_PRUEBA",
      titularCuenta: "TITULAR_DE_PRUEBA",
      rutTitular: "RUT_DE_PRUEBA",
      correo: "correo@example.com"
    })).toEqual({
      bancoCompleto: true,
      tipoCuentaCompleto: true,
      numeroCuentaCompleto: true,
      titularCompleto: true,
      rutCompleto: true,
      correoCompleto: true
    });
  });

  it("resuelve labels comerciales sin mostrar values tecnicos", () => {
    expect(resolveBankDisplayName("BANCOESTADO")).toBe("BancoEstado");
    expect(resolveAccountTypeDisplayName("CUENTA_VISTA")).toBe("Cuenta vista");
  });
});
