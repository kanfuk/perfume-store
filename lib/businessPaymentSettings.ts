/**
 * Validacion, normalizacion y resolucion de "Datos de transferencia"
 * (Fase 3B.1A). Puro y testeable: sin acceso a red/DB. business_settings
 * solo tiene columnas de texto planas (banco, tipo_cuenta, numero_cuenta,
 * titular_cuenta, rut_titular, correo) - no hay una columna separada para
 * "es catalogo o es texto libre", asi que cuando el admin elige "Otro
 * banco"/"Otra cuenta" se persiste directamente el texto ingresado en vez
 * del codigo OTRO_BANCO/OTRA. Al leer, si el valor guardado no coincide con
 * ningun value del catalogo se asume que es un nombre libre.
 */
import {
  OTRA_CUENTA_VALUE,
  findChileanAccountTypeLabel,
  isChileanAccountTypeValue
} from "@/config/chileanAccountTypes";
import {
  OTRO_BANCO_VALUE,
  findChileanBankLabel,
  isChileanBankValue
} from "@/config/chileanBanks";
import { normalizeEmail, isValidEmail } from "@/lib/validators";
import { parseChileanRut } from "@/lib/rut";

export type BusinessPaymentSettingsFormInput = {
  banco: string;
  bancoOtro?: string;
  tipoCuenta: string;
  tipoCuentaOtro?: string;
  titularCuenta: string;
  rutTitular: string;
  numeroCuenta: string;
  correo: string;
};

/** Forma persistida (1:1 con las columnas de business_settings). */
export type BusinessPaymentSettings = {
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titularCuenta: string;
  rutTitular: string;
  correo: string;
};

export type BusinessPaymentSettingsFieldErrors = Partial<
  Record<
    | "banco"
    | "bancoOtro"
    | "tipoCuenta"
    | "tipoCuentaOtro"
    | "titularCuenta"
    | "rutTitular"
    | "numeroCuenta"
    | "correo",
    string
  >
>;

export type ValidateBusinessPaymentSettingsResult =
  | { valid: true; data: BusinessPaymentSettings }
  | { valid: false; errors: BusinessPaymentSettingsFieldErrors };

const TITULAR_MAX_LENGTH = 120;
const BANCO_OTRO_MAX_LENGTH = 80;
const TIPO_CUENTA_OTRO_MAX_LENGTH = 40;
const NUMERO_CUENTA_MAX_LENGTH = 30;

export function validateBusinessPaymentSettings(
  input: BusinessPaymentSettingsFormInput
): ValidateBusinessPaymentSettingsResult {
  const errors: BusinessPaymentSettingsFieldErrors = {};

  const titularCuenta = (input.titularCuenta ?? "").trim();
  if (!titularCuenta) {
    errors.titularCuenta = "Ingresa el titular de la cuenta.";
  } else if (titularCuenta.length > TITULAR_MAX_LENGTH) {
    errors.titularCuenta = "El nombre del titular es demasiado largo.";
  }

  const rut = parseChileanRut(input.rutTitular ?? "");
  if (!rut) {
    errors.rutTitular = "Ingresa un RUT chileno valido.";
  }

  let banco = "";
  if (!input.banco?.trim()) {
    errors.banco = "Selecciona un banco.";
  } else if (input.banco === OTRO_BANCO_VALUE) {
    const bancoOtro = (input.bancoOtro ?? "").trim();
    if (!bancoOtro) {
      errors.bancoOtro = "Ingresa el nombre del banco o institucion.";
    } else if (bancoOtro.length > BANCO_OTRO_MAX_LENGTH) {
      errors.bancoOtro = "El nombre del banco es demasiado largo.";
    } else {
      banco = bancoOtro;
    }
  } else if (!isChileanBankValue(input.banco)) {
    errors.banco = "Selecciona un banco valido de la lista.";
  } else {
    banco = input.banco;
  }

  let tipoCuenta = "";
  if (!input.tipoCuenta?.trim()) {
    errors.tipoCuenta = "Selecciona un tipo de cuenta.";
  } else if (input.tipoCuenta === OTRA_CUENTA_VALUE) {
    const tipoCuentaOtro = (input.tipoCuentaOtro ?? "").trim();
    if (!tipoCuentaOtro) {
      errors.tipoCuentaOtro = "Ingresa el tipo de cuenta.";
    } else if (tipoCuentaOtro.length > TIPO_CUENTA_OTRO_MAX_LENGTH) {
      errors.tipoCuentaOtro = "El tipo de cuenta es demasiado largo.";
    } else {
      tipoCuenta = tipoCuentaOtro;
    }
  } else if (!isChileanAccountTypeValue(input.tipoCuenta)) {
    errors.tipoCuenta = "Selecciona un tipo de cuenta valido de la lista.";
  } else {
    tipoCuenta = input.tipoCuenta;
  }

  const numeroCuenta = (input.numeroCuenta ?? "").trim();
  if (!numeroCuenta) {
    errors.numeroCuenta = "Ingresa el numero de cuenta.";
  } else if (numeroCuenta.length > NUMERO_CUENTA_MAX_LENGTH) {
    errors.numeroCuenta = "El numero de cuenta es demasiado largo.";
  }

  const correoTrimmed = (input.correo ?? "").trim();
  if (!correoTrimmed) {
    errors.correo = "Ingresa un correo para transferencias.";
  } else if (!isValidEmail(correoTrimmed)) {
    errors.correo = "Ingresa un correo con formato valido.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      banco,
      tipoCuenta,
      numeroCuenta,
      titularCuenta,
      rutTitular: rut!.normalized,
      correo: normalizeEmail(correoTrimmed)
    }
  };
}

/** Nombre comercial legible del banco: etiqueta del catalogo o el texto libre guardado. */
export function resolveBankDisplayName(banco: string): string {
  return findChileanBankLabel(banco) ?? banco;
}

/** Etiqueta comercial legible del tipo de cuenta: nunca el valor tecnico crudo. */
export function resolveAccountTypeDisplayName(tipoCuenta: string): string {
  return findChileanAccountTypeLabel(tipoCuenta) ?? tipoCuenta;
}

/** Reconstruye la forma editable, incluyendo los campos condicionales Otro. */
export function businessPaymentSettingsToFormInput(
  settings: Partial<BusinessPaymentSettings> | null | undefined
): BusinessPaymentSettingsFormInput {
  const banco = settings?.banco?.trim() ?? "";
  const tipoCuenta = settings?.tipoCuenta?.trim() ?? "";

  return {
    banco: !banco || isChileanBankValue(banco) ? banco : OTRO_BANCO_VALUE,
    bancoOtro: banco && !isChileanBankValue(banco) ? banco : "",
    tipoCuenta:
      !tipoCuenta || isChileanAccountTypeValue(tipoCuenta)
        ? tipoCuenta
        : OTRA_CUENTA_VALUE,
    tipoCuentaOtro:
      tipoCuenta && !isChileanAccountTypeValue(tipoCuenta) ? tipoCuenta : "",
    titularCuenta: settings?.titularCuenta ?? "",
    rutTitular: settings?.rutTitular ?? "",
    numeroCuenta: settings?.numeroCuenta ?? "",
    correo: settings?.correo ?? ""
  };
}

/** true solo si la configuracion persistida vuelve a pasar toda la validacion. */
export function isBusinessPaymentSettingsComplete(
  settings: Partial<BusinessPaymentSettings> | null | undefined
): settings is BusinessPaymentSettings {
  if (!settings) {
    return false;
  }

  return validateBusinessPaymentSettings(
    businessPaymentSettingsToFormInput(settings)
  ).valid;
}

/** Lista de campos faltantes, en espanol, para mostrar en el panel de estado. */
export function missingBusinessPaymentSettingsFields(
  settings: Partial<BusinessPaymentSettings> | null | undefined
): string[] {
  const missing: string[] = [];
  if (!settings?.banco?.trim()) missing.push("Banco");
  if (!settings?.tipoCuenta?.trim()) missing.push("Tipo de cuenta");
  if (!settings?.titularCuenta?.trim()) missing.push("Titular de la cuenta");
  if (!settings?.rutTitular?.trim()) missing.push("RUT del titular");
  if (!settings?.numeroCuenta?.trim()) missing.push("Número de cuenta");
  if (!settings?.correo?.trim()) missing.push("Correo para transferencia");
  return missing;
}

/** Oculta la mayoria del numero de cuenta, mostrando solo los ultimos 4 caracteres. */
export function maskAccountNumber(numeroCuenta: string): string {
  const trimmed = numeroCuenta.trim();
  if (trimmed.length <= 4) {
    return "•".repeat(trimmed.length);
  }
  return `${"•".repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}
