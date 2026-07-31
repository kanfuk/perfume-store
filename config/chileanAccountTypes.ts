/**
 * Catalogo local de tipos de cuenta bancaria chilena para el select de
 * "Datos de transferencia" (Fase 3B.1A).
 *
 * `value` es el valor estable que se persiste en business_settings.tipo_cuenta;
 * nunca cambiar `value` de una entrada existente. OTRA siempre al final.
 */
export type ChileanAccountTypeOption = {
  value: string;
  label: string;
};

export const OTRA_CUENTA_VALUE = "OTRA";

export const CHILEAN_ACCOUNT_TYPES: ChileanAccountTypeOption[] = [
  { value: "CUENTA_CORRIENTE", label: "Cuenta corriente" },
  { value: "CUENTA_VISTA", label: "Cuenta vista" },
  { value: "CUENTA_RUT", label: "Cuenta RUT" },
  { value: "CUENTA_AHORRO", label: "Cuenta de ahorro" },
  { value: "CHEQUERA_ELECTRONICA", label: "Chequera electrónica" },
  { value: OTRA_CUENTA_VALUE, label: "Otra" }
];

export function isChileanAccountTypeValue(value: string): boolean {
  return CHILEAN_ACCOUNT_TYPES.some((type) => type.value === value);
}

export function findChileanAccountTypeLabel(value: string): string | undefined {
  return CHILEAN_ACCOUNT_TYPES.find((type) => type.value === value)?.label;
}
