/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Parser CSV
 * Descripcion: Parser CSV tolerante a comillas embebidas (estilo Excel), delimitador
 * configurable, eliminacion de filas totalmente vacias y mapeo a filas tipadas
 * de julio/junio.
 */

import type { DelimiterChar, RawSourceRow, SourceSheet } from "./types.ts";
import { normalizeDisplayText } from "./normalization.ts";

/** Parsea texto CSV completo a una matriz de campos, respetando comillas RFC4180. */
export function parseCsvLines(text: string, delimiter: DelimiterChar): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === delimiter) {
      pushField();
      i += 1;
      continue;
    }

    if (char === "\r") {
      i += 1;
      continue;
    }

    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/**
 * Considera vacia una fila cuando sus columnas relevantes (perfume, marca,
 * contenido y las columnas de precio/costo usadas por la hoja) estan vacias,
 * ignorando columnas no usadas (ej. residuos de formulas de Excel como un
 * "0" solitario en la columna Ganancia de filas por lo demas vacias).
 */
function isBlankRow(fields: string[], relevantFieldCount: number): boolean {
  return fields.slice(0, relevantFieldCount).every((f) => normalizeDisplayText(f) === "");
}

function parseChileanCurrency(value: string): number | undefined {
  const trimmed = normalizeDisplayText(value);
  if (trimmed === "" || trimmed === "$-" || trimmed === "-") return undefined;
  const digitsOnly = trimmed.replace(/[^0-9]/g, "");
  if (digitsOnly === "") return undefined;
  return Number.parseInt(digitsOnly, 10);
}

export type ParseResult = {
  sheet: SourceSheet;
  filasFisicas: number;
  filasVacias: number;
  filasUtiles: number;
  rows: RawSourceRow[];
};

/**
 * Planilla de julio: Perfume;Marca;Contenido;Precio Compra (costo, NO precio de venta).
 */
export function parseJulioRows(text: string, delimiter: DelimiterChar): ParseResult {
  const matrix = parseCsvLines(text, delimiter);
  const dataLines = matrix.slice(1);
  let filasVacias = 0;
  const rows: RawSourceRow[] = [];

  dataLines.forEach((fields, index) => {
    if (isBlankRow(fields, 4)) {
      filasVacias += 1;
      return;
    }

    const [perfume = "", marca = "", contenido = "", precioCompraRaw = ""] = fields;
    rows.push({
      sheet: "julio",
      rowNumber: index + 2,
      perfume: normalizeDisplayText(perfume),
      marca: normalizeDisplayText(marca),
      contenido: normalizeDisplayText(contenido),
      precioCompra: parseChileanCurrency(precioCompraRaw)
    });
  });

  return {
    sheet: "julio",
    filasFisicas: dataLines.length,
    filasVacias,
    filasUtiles: rows.length,
    rows
  };
}

/**
 * Planilla de junio: Perfume;Marca;Contenido;Costo Unitario;Precio Venta;...;Ganancia.
 */
export function parseJunioRows(text: string, delimiter: DelimiterChar): ParseResult {
  const matrix = parseCsvLines(text, delimiter);
  const dataLines = matrix.slice(1);
  let filasVacias = 0;
  const rows: RawSourceRow[] = [];

  dataLines.forEach((fields, index) => {
    if (isBlankRow(fields, 5)) {
      filasVacias += 1;
      return;
    }

    const [perfume = "", marca = "", contenido = "", costoUnitarioRaw = "", precioVentaRaw = ""] = fields;
    rows.push({
      sheet: "junio",
      rowNumber: index + 2,
      perfume: normalizeDisplayText(perfume),
      marca: normalizeDisplayText(marca),
      contenido: normalizeDisplayText(contenido),
      costoUnitario: parseChileanCurrency(costoUnitarioRaw),
      precioVenta: parseChileanCurrency(precioVentaRaw)
    });
  });

  return {
    sheet: "junio",
    filasFisicas: dataLines.length,
    filasVacias,
    filasUtiles: rows.length,
    rows
  };
}
