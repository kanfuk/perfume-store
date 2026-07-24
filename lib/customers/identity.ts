/**
 * Proyecto: Perfume Store
 * Modulo: Identidad de clientes
 * Descripcion: Normalizacion generica para detectar clientes duplicados.
 *
 * Estrategia (en orden de confianza):
 *   1. telefono normalizado
 *   2. RUT normalizado (cuando exista)
 *   3. correo normalizado (cuando exista)
 *   4. nombre normalizado, solo como apoyo, nunca como identidad suficiente por si sola
 *
 * No contiene nombres reales de clientes. La implementacion heredada contenia
 * alias especificos del negocio anterior. Esta version utiliza identificadores
 * normalizados y genericos.
 */

export function normalizeCustomerLookupValue(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeCustomerDisplayName(value: string) {
  return value.trim();
}

export function normalizeCustomerPhoneKey(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeCustomerRutKey(value: string) {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function normalizeCustomerEmailKey(value: string) {
  return value.trim().toLowerCase();
}

export function isWeakCustomerWorkplaceName(value: string) {
  const normalized = normalizeCustomerLookupValue(value);

  return (
    normalized === "" ||
    normalized === "venta directa" ||
    normalized === "venta whatsapp manual" ||
    normalized === "pedido personalizado"
  );
}
