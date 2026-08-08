import { describe, expect, it } from "vitest";
import {
  buildAdminPaymentAccountSnapshot,
  getAdminPaymentAccountStatus,
  validateAdminPaymentAccount,
  type AdminPaymentAccountRecord
} from "@/lib/admin-payment-accounts";

const input = {
  banco: "BANCOESTADO",
  bancoOtro: "",
  tipoCuenta: "CUENTA_VISTA",
  tipoCuentaOtro: "",
  titularCuenta: "Operador Uno",
  rutTitular: "12.345.678-5",
  numeroCuenta: "0012345678",
  correo: "operador@example.cl",
  active: true
};

const account: AdminPaymentAccountRecord = {
  id: "account-1",
  adminUserId: "admin-1",
  banco: "BANCOESTADO",
  bancoOtro: null,
  tipoCuenta: "CUENTA_VISTA",
  tipoCuentaOtro: null,
  titular: "Operador Uno",
  rutTitular: "12.345.678-5",
  numeroCuenta: "0012345678",
  correo: "operador@example.cl",
  active: true
};

describe("cuentas de cobro por ADMIN", () => {
  it("valida y normaliza los datos operativos", () => {
    const result = validateAdminPaymentAccount(input);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data).toMatchObject({
        banco: "BANCOESTADO",
        titular: "Operador Uno",
        active: true
      });
    }
  });

  it("exige banco, cuenta, RUT y correo válidos", () => {
    const result = validateAdminPaymentAccount({
      ...input,
      banco: "",
      numeroCuenta: "",
      rutTitular: "1-1",
      correo: "invalido"
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toMatchObject({
        banco: expect.any(String),
        numeroCuenta: expect.any(String),
        rutTitular: expect.any(String),
        correo: expect.any(String)
      });
    }
  });

  it("distingue pendiente, configurada e inactiva", () => {
    expect(getAdminPaymentAccountStatus(null)).toBe("PENDING");
    expect(getAdminPaymentAccountStatus(account)).toBe("CONFIGURED");
    expect(getAdminPaymentAccountStatus({ ...account, active: false })).toBe("INACTIVE");
  });

  it("construye el snapshot comercial exacto", () => {
    expect(buildAdminPaymentAccountSnapshot(account)).toEqual({
      accountHolder: "Operador Uno",
      rut: "12.345.678-5",
      bank: "BancoEstado",
      accountType: "Cuenta vista",
      accountNumber: "0012345678",
      email: "operador@example.cl"
    });
  });
});
