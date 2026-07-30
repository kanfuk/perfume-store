/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog build script - escritor CSV
 * Descripcion: Serializacion CSV determinista (UTF-8, sin BOM, comas, comillas
 * RFC4180 solo cuando son necesarias).
 */

function escapeField(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeField(row[h])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
