/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Importador admin (CSV masivo)
 * Descripcion: Parseo y validacion de un CSV de catalogo (formato canonico:
 * sku,nombre,marca,contenido,costo_unitario,precio_venta,stock,activo,es_top,
 * orden_destacado,es_oferta_semana,precio_anterior,image_url) para el
 * importador del panel admin. Nunca escribe: solo produce un plan de
 * creacion/actualizacion/bloqueo (preview) para que el admin confirme.
 */

import { detectEncoding, decodeBuffer } from "./encoding.ts";
import { detectDelimiter } from "./delimiter.ts";
import { parseCsvLines } from "./parser.ts";
import { normalizeDisplayText } from "./normalization.ts";
import { TOP_PRODUCTS_LIMIT } from "../constants.ts";

export type AdminImportRow = {
  rowNumber: number;
  sku: string;
  nombre: string;
  marca: string;
  contenido: string;
  costoUnitario: number | null;
  precioVenta: number | null;
  stock: number | null;
  activo: boolean;
  esTop: boolean;
  ordenDestacado: number | null;
  esOfertaSemana: boolean;
  precioAnterior: number | null;
  imageUrl: string;
};

export type AdminImportRowError = {
  rowNumber: number;
  sku: string;
  message: string;
};

export type AdminImportAction = "CREAR" | "ACTUALIZAR" | "BLOQUEADO";

export type AdminImportPlanRow = {
  row: AdminImportRow;
  action: AdminImportAction;
  reasons: string[];
};

export type AdminImportPreview = {
  totalFilas: number;
  filasValidas: AdminImportRow[];
  erroresFila: AdminImportRowError[];
  plan: AdminImportPlanRow[];
  resumen: {
    crear: number;
    actualizar: number;
    bloqueado: number;
  };
  erroresGlobales: string[];
};

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB
const REQUIRED_HEADERS = ["sku", "nombre", "marca", "contenido"];

function parseBoolean(value: string): boolean {
  const normalized = normalizeDisplayText(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "si" || normalized === "sí";
}

function parseNumberOrNull(value: string): number | null {
  const trimmed = normalizeDisplayText(value);
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateFileSize(sizeBytes: number): string | null {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return `El archivo supera el tamaño máximo permitido (${MAX_FILE_SIZE_BYTES / 1024 / 1024} MiB).`;
  }
  return null;
}

export function validateFileNameExtension(fileName: string): string | null {
  if (!/\.csv$/i.test(fileName.trim())) {
    return "Solo se aceptan archivos con extensión .csv.";
  }
  return null;
}

/** Rechaza contenido binario/no textual disfrazado de CSV (bytes nulos, control chars). */
export function validateBinaryContent(buffer: Buffer): string | null {
  const sampleSize = Math.min(buffer.length, 4096);
  for (let i = 0; i < sampleSize; i += 1) {
    const byte = buffer[i];
    if (byte === 0) return "El archivo no parece ser un CSV de texto válido.";
  }
  return null;
}

export function parseAdminImportCsv(buffer: Buffer): {
  rows: AdminImportRow[];
  errors: AdminImportRowError[];
  globalErrors: string[];
} {
  const encoding = detectEncoding(buffer);
  const text = decodeBuffer(buffer, encoding);
  const delimiter = detectDelimiter(text);
  const matrix = parseCsvLines(text, delimiter);

  if (matrix.length === 0) {
    return { rows: [], errors: [], globalErrors: ["El archivo está vacío."] };
  }

  const headers = matrix[0].map((h) => normalizeDisplayText(h).toLowerCase());
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      errors: [],
      globalErrors: [`Faltan columnas requeridas: ${missingHeaders.join(", ")}.`]
    };
  }

  const index = Object.fromEntries(headers.map((h, i) => [h, i]));
  const get = (fields: string[], name: string) => normalizeDisplayText(fields[index[name]] ?? "");

  const rows: AdminImportRow[] = [];
  const errors: AdminImportRowError[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const fields = matrix[i];
    if (fields.every((f) => normalizeDisplayText(f) === "")) continue;

    const rowNumber = i + 1;
    const sku = get(fields, "sku");
    const nombre = get(fields, "nombre");
    const marca = get(fields, "marca");

    if (!sku) {
      errors.push({ rowNumber, sku: "", message: "Falta el SKU." });
      continue;
    }
    if (!nombre) {
      errors.push({ rowNumber, sku, message: "Falta el nombre." });
      continue;
    }

    rows.push({
      rowNumber,
      sku,
      nombre,
      marca,
      contenido: get(fields, "contenido"),
      costoUnitario: parseNumberOrNull(get(fields, "costo_unitario")),
      precioVenta: parseNumberOrNull(get(fields, "precio_venta")),
      stock: parseNumberOrNull(get(fields, "stock")),
      activo: parseBoolean(get(fields, "activo")),
      esTop: parseBoolean(get(fields, "es_top")),
      ordenDestacado: parseNumberOrNull(get(fields, "orden_destacado")),
      esOfertaSemana: parseBoolean(get(fields, "es_oferta_semana")),
      precioAnterior: parseNumberOrNull(get(fields, "precio_anterior")),
      imageUrl: get(fields, "image_url")
    });
  }

  return { rows, errors, globalErrors: [] };
}

/**
 * Valida reglas de negocio sobre las filas ya parseadas:
 * - SKU unico dentro del archivo.
 * - stock y precio no negativos.
 * - activo=true exige precio_venta y stock definidos (no null, no negativos).
 * - maximo TOP_PRODUCTS_LIMIT destacados, posiciones 1..N unicas.
 */
export function validateAdminImportRows(rows: AdminImportRow[]): {
  valid: AdminImportRow[];
  errors: AdminImportRowError[];
  globalErrors: string[];
} {
  const errors: AdminImportRowError[] = [];
  const globalErrors: string[] = [];
  const seenSkus = new Map<string, number>();
  const valid: AdminImportRow[] = [];

  for (const row of rows) {
    const rowErrors: string[] = [];

    if (seenSkus.has(row.sku)) {
      rowErrors.push(`SKU duplicado dentro del archivo (también en fila ${seenSkus.get(row.sku)}).`);
    } else {
      seenSkus.set(row.sku, row.rowNumber);
    }

    if (row.stock !== null && row.stock < 0) rowErrors.push("El stock no puede ser negativo.");
    if (row.precioVenta !== null && row.precioVenta < 0) rowErrors.push("El precio de venta no puede ser negativo.");
    if (row.costoUnitario !== null && row.costoUnitario < 0) rowErrors.push("El costo unitario no puede ser negativo.");
    if (row.precioAnterior !== null && row.precioAnterior < 0) rowErrors.push("El precio anterior no puede ser negativo.");

    if (row.activo) {
      if (row.precioVenta === null) rowErrors.push("Un producto activo exige precio de venta.");
      if (row.stock === null || row.stock <= 0) rowErrors.push("Un producto activo exige stock disponible.");
    }

    if (row.esTop && (row.ordenDestacado === null || row.ordenDestacado < 1 || row.ordenDestacado > TOP_PRODUCTS_LIMIT)) {
      rowErrors.push(`Si es_top es verdadero, orden_destacado debe estar entre 1 y ${TOP_PRODUCTS_LIMIT}.`);
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber: row.rowNumber, sku: row.sku, message: rowErrors.join(" ") });
      continue;
    }

    valid.push(row);
  }

  const topRows = valid.filter((r) => r.esTop);
  if (topRows.length > TOP_PRODUCTS_LIMIT) {
    globalErrors.push(
      `Hay ${topRows.length} productos marcados como destacados; el máximo permitido es ${TOP_PRODUCTS_LIMIT}.`
    );
  }

  const positionCounts = new Map<number, number>();
  for (const row of topRows) {
    if (row.ordenDestacado === null) continue;
    positionCounts.set(row.ordenDestacado, (positionCounts.get(row.ordenDestacado) ?? 0) + 1);
  }
  const duplicatedPositions = [...positionCounts.entries()].filter(([, count]) => count > 1);
  if (duplicatedPositions.length > 0) {
    globalErrors.push(
      `Posiciones de orden_destacado repetidas: ${duplicatedPositions.map(([pos]) => pos).join(", ")}.`
    );
  }

  return { valid, errors, globalErrors };
}

/**
 * Construye el plan de importacion (crear/actualizar/bloqueado) SIN escribir
 * nada. `existingSkus` son los SKU ya presentes en el catalogo remoto.
 */
export function buildImportPlan(
  validRows: AdminImportRow[],
  existingSkus: ReadonlySet<string>
): AdminImportPlanRow[] {
  return validRows.map((row) => {
    const exists = existingSkus.has(row.sku);
    return {
      row,
      action: exists ? "ACTUALIZAR" : "CREAR",
      reasons: []
    };
  });
}

export function buildAdminImportPreview(
  buffer: Buffer,
  existingSkus: ReadonlySet<string>
): AdminImportPreview {
  const parsed = parseAdminImportCsv(buffer);
  if (parsed.globalErrors.length > 0) {
    return {
      totalFilas: 0,
      filasValidas: [],
      erroresFila: [],
      plan: [],
      resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
      erroresGlobales: parsed.globalErrors
    };
  }

  const validation = validateAdminImportRows(parsed.rows);
  const plan = buildImportPlan(validation.valid, existingSkus);
  const allErrors = [...parsed.errors, ...validation.errors];

  return {
    totalFilas: parsed.rows.length + parsed.errors.length,
    filasValidas: validation.valid,
    erroresFila: allErrors,
    plan,
    resumen: {
      crear: plan.filter((p) => p.action === "CREAR").length,
      actualizar: plan.filter((p) => p.action === "ACTUALIZAR").length,
      bloqueado: allErrors.length
    },
    erroresGlobales: validation.globalErrors
  };
}
