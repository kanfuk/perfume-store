import { OTRA_CUENTA_VALUE } from "@/config/chileanAccountTypes";
import { OTRO_BANCO_VALUE } from "@/config/chileanBanks";
import {
  resolveAccountTypeDisplayName,
  resolveBankDisplayName,
  validateBusinessPaymentSettings,
  type BusinessPaymentSettingsFieldErrors,
  type BusinessPaymentSettingsFormInput
} from "@/lib/businessPaymentSettings";

export type AdminPaymentAccountStatus = "CONFIGURED" | "PENDING" | "INACTIVE";

export type AdminPaymentAccountFormInput = BusinessPaymentSettingsFormInput & {
  active: boolean;
};

export type AdminPaymentAccountRecord = {
  id: string;
  adminUserId: string;
  banco: string;
  bancoOtro: string | null;
  tipoCuenta: string;
  tipoCuentaOtro: string | null;
  titular: string;
  rutTitular: string;
  numeroCuenta: string;
  correo: string;
  active: boolean;
};

export type AdminPaymentAccountSnapshot = {
  accountHolder: string;
  rut: string;
  bank: string;
  accountType: string;
  accountNumber: string;
  email: string;
};

export type ValidatedAdminPaymentAccount = Omit<
  AdminPaymentAccountRecord,
  "id" | "adminUserId"
>;

export type ValidateAdminPaymentAccountResult =
  | { valid: true; data: ValidatedAdminPaymentAccount }
  | { valid: false; errors: BusinessPaymentSettingsFieldErrors };

export function validateAdminPaymentAccount(
  input: AdminPaymentAccountFormInput
): ValidateAdminPaymentAccountResult {
  const validation = validateBusinessPaymentSettings(input);
  if (!validation.valid) return validation;

  return {
    valid: true,
    data: {
      banco: input.banco.trim(),
      bancoOtro:
        input.banco === OTRO_BANCO_VALUE ? input.bancoOtro?.trim() || null : null,
      tipoCuenta: input.tipoCuenta.trim(),
      tipoCuentaOtro:
        input.tipoCuenta === OTRA_CUENTA_VALUE
          ? input.tipoCuentaOtro?.trim() || null
          : null,
      titular: validation.data.titularCuenta,
      rutTitular: validation.data.rutTitular,
      numeroCuenta: validation.data.numeroCuenta,
      correo: validation.data.correo,
      active: input.active
    }
  };
}

export function adminPaymentAccountToFormInput(
  account: AdminPaymentAccountRecord
): AdminPaymentAccountFormInput {
  return {
    banco: account.banco,
    bancoOtro: account.bancoOtro ?? "",
    tipoCuenta: account.tipoCuenta,
    tipoCuentaOtro: account.tipoCuentaOtro ?? "",
    titularCuenta: account.titular,
    rutTitular: account.rutTitular,
    numeroCuenta: account.numeroCuenta,
    correo: account.correo,
    active: account.active
  };
}

export function getAdminPaymentAccountStatus(
  account: AdminPaymentAccountRecord | null | undefined
): AdminPaymentAccountStatus {
  if (!account) return "PENDING";
  if (!account.active) return "INACTIVE";
  return validateAdminPaymentAccount(adminPaymentAccountToFormInput(account)).valid
    ? "CONFIGURED"
    : "PENDING";
}

export function buildAdminPaymentAccountSnapshot(
  account: AdminPaymentAccountRecord
): AdminPaymentAccountSnapshot {
  return {
    accountHolder: account.titular,
    rut: account.rutTitular,
    bank:
      account.banco === OTRO_BANCO_VALUE
        ? account.bancoOtro ?? ""
        : resolveBankDisplayName(account.banco),
    accountType:
      account.tipoCuenta === OTRA_CUENTA_VALUE
        ? account.tipoCuentaOtro ?? ""
        : resolveAccountTypeDisplayName(account.tipoCuenta),
    accountNumber: account.numeroCuenta,
    email: account.correo
  };
}

export function isAdminPaymentAccountSnapshot(
  value: unknown
): value is AdminPaymentAccountSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return ["accountHolder", "rut", "bank", "accountType", "accountNumber", "email"].every(
    (key) => typeof snapshot[key] === "string" && snapshot[key] !== ""
  );
}
