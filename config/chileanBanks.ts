/**
 * Catalogo local de bancos e instituciones financieras chilenas para el
 * select de "Datos de transferencia" (Fase 3B.1A). No consulta ningun
 * servicio externo en tiempo de ejecucion.
 *
 * Referencia: nomina de bancos establecidos en Chile publicada por la
 * Comision para el Mercado Financiero (CMF), mas los principales bancos
 * digitales/neobancos con cuenta vista/RUT operativa, al 2026-07-31.
 *
 * `value` es el valor estable que se persiste en business_settings.banco;
 * nunca cambiar `value` de una entrada existente (romperia configuraciones
 * ya guardadas). Para renombrar la etiqueta visible, solo tocar `label`.
 * Orden alfabetico por label (comparando en minusculas y sin espacios, ver
 * tests/config/chileanBanks.test.ts), con OTRO_BANCO siempre al final.
 */
export type ChileanBankOption = {
  value: string;
  label: string;
  normalizedName: string;
};

export const OTRO_BANCO_VALUE = "OTRO_BANCO";

export const CHILEAN_BANKS: ChileanBankOption[] = [
  { value: "BANCO_BICE", label: "Banco BICE", normalizedName: "banco bice" },
  { value: "BANCO_CONSORCIO", label: "Banco Consorcio", normalizedName: "banco consorcio" },
  { value: "BANCO_DE_CHILE", label: "Banco de Chile", normalizedName: "banco de chile" },
  {
    value: "BCI",
    label: "Banco de Crédito e Inversiones (BCI)",
    normalizedName: "banco de credito e inversiones bci"
  },
  { value: "BANCOESTADO", label: "BancoEstado", normalizedName: "bancoestado" },
  { value: "BANCO_FALABELLA", label: "Banco Falabella", normalizedName: "banco falabella" },
  {
    value: "BANCO_INTERNACIONAL",
    label: "Banco Internacional",
    normalizedName: "banco internacional"
  },
  { value: "ITAU_CHILE", label: "Banco Itaú Chile", normalizedName: "banco itau chile" },
  { value: "BANCO_RIPLEY", label: "Banco Ripley", normalizedName: "banco ripley" },
  { value: "BANCO_SANTANDER", label: "Banco Santander", normalizedName: "banco santander" },
  { value: "BANCO_SECURITY", label: "Banco Security", normalizedName: "banco security" },
  { value: "HSBC_CHILE", label: "HSBC Bank Chile", normalizedName: "hsbc bank chile" },
  { value: "MACH", label: "MACH (Banco BICE)", normalizedName: "mach banco bice" },
  { value: "MERCADO_PAGO", label: "Mercado Pago", normalizedName: "mercado pago" },
  { value: "SCOTIABANK_CHILE", label: "Scotiabank Chile", normalizedName: "scotiabank chile" },
  { value: "TENPO", label: "Tenpo", normalizedName: "tenpo" },
  {
    value: OTRO_BANCO_VALUE,
    label: "Otro banco o institución",
    normalizedName: "otro banco o institucion"
  }
];

export function isChileanBankValue(value: string): boolean {
  return CHILEAN_BANKS.some((bank) => bank.value === value);
}

export function findChileanBankLabel(value: string): string | undefined {
  return CHILEAN_BANKS.find((bank) => bank.value === value)?.label;
}
