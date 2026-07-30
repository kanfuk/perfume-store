/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Catalog Import - Perfil "CSV de proveedor"
 * Descripcion: Acepta directamente el CSV real que entrega el proveedor
 * (Perfume;Marca;Contenido;Precio Compra, con variaciones razonables de
 * encabezado), lo normaliza al formato canonico, genera SKU deterministas
 * y calcula el precio de venta aplicando un recargo configurable sobre el
 * costo. Nunca confunde Precio Compra (costo) con precio de venta.
 */

import { detectEncoding, decodeBuffer } from "./encoding.ts";
import { detectDelimiter } from "./delimiter.ts";
import { parseCsvLines } from "./parser.ts";
import { normalizeDisplayText, normalizeHeaderKey, normalizeContenido, buildReconciliationKey } from "./normalization.ts";
import { assignDeterministicSkus } from "./sku.ts";
import type { AdminImportRowError } from "./admin-import.ts";

export type ImportProfile = "proveedor" | "canonico";

const CANONICAL_HEADER_KEYS = new Set(["sku", "nombre"]);
const SUPPLIER_REQUIRED_KEYS = new Set(["perfume", "marca", "contenido"]);
const SUPPLIER_COST_ALIASES = new Set(["preciocompra", "costo", "costounitario"]);

/**
 * Detecta el perfil de un archivo a partir de sus encabezados normalizados.
 * Retorna null cuando no coincide de forma confiable con ningun perfil
 * conocido (el llamador debe pedir seleccion manual, nunca adivinar).
 */
export function detectImportProfile(headerRow: string[]): ImportProfile | null {
  const keys = new Set(headerRow.map((h) => normalizeHeaderKey(h)));

  const hasCanonical = [...CANONICAL_HEADER_KEYS].every((k) => keys.has(k));
  if (hasCanonical) return "canonico";

  const hasSupplierBase = [...SUPPLIER_REQUIRED_KEYS].every((k) => keys.has(k));
  const hasCostColumn = [...SUPPLIER_COST_ALIASES].some((k) => keys.has(k));
  if (hasSupplierBase && hasCostColumn) return "proveedor";

  return null;
}

export type SupplierImportRow = {
  rowNumber: number;
  perfume: string;
  marca: string;
  contenido: string;
  precioCompra: number;
};

export type SupplierParseResult = {
  rows: SupplierImportRow[];
  errors: AdminImportRowError[];
  filasFisicas: number;
  filasVacias: number;
  globalErrors: string[];
};

function parseChileanCurrency(value: string): number | null {
  const trimmed = normalizeDisplayText(value);
  if (trimmed === "" || trimmed === "$-" || trimmed === "-") return null;
  const digitsOnly = trimmed.replace(/[^0-9]/g, "");
  if (digitsOnly === "") return null;
  return Number.parseInt(digitsOnly, 10);
}

/**
 * Parsea el CSV de proveedor. Detecta encoding/delimitador, ignora filas
 * completamente vacias (solo en las columnas relevantes) y rechaza filas a
 * las que les falte Perfume, Marca, Contenido o un Precio Compra valido,
 * informando fila y motivo exacto.
 */
export function parseSupplierCsv(buffer: Buffer): SupplierParseResult {
  const encoding = detectEncoding(buffer);
  const text = decodeBuffer(buffer, encoding);
  const delimiter = detectDelimiter(text);
  const matrix = parseCsvLines(text, delimiter);

  if (matrix.length === 0) {
    return { rows: [], errors: [], filasFisicas: 0, filasVacias: 0, globalErrors: ["El archivo está vacío."] };
  }

  const headerRow = matrix[0];
  const headerKeys = headerRow.map((h) => normalizeHeaderKey(h));
  const indexOfAny = (aliases: Set<string>) => headerKeys.findIndex((k) => aliases.has(k));

  const idxPerfume = indexOfAny(new Set(["perfume"]));
  const idxMarca = indexOfAny(new Set(["marca"]));
  const idxContenido = indexOfAny(new Set(["contenido"]));
  const idxPrecioCompra = indexOfAny(SUPPLIER_COST_ALIASES);

  const missing: string[] = [];
  if (idxPerfume === -1) missing.push("Perfume");
  if (idxMarca === -1) missing.push("Marca");
  if (idxContenido === -1) missing.push("Contenido");
  if (idxPrecioCompra === -1) missing.push("Precio Compra");
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [],
      filasFisicas: 0,
      filasVacias: 0,
      globalErrors: [`Faltan columnas del proveedor: ${missing.join(", ")}.`]
    };
  }

  const dataLines = matrix.slice(1);
  let filasVacias = 0;
  const rows: SupplierImportRow[] = [];
  const errors: AdminImportRowError[] = [];

  dataLines.forEach((fields, i) => {
    const rowNumber = i + 2;
    const relevant = [
      fields[idxPerfume] ?? "",
      fields[idxMarca] ?? "",
      fields[idxContenido] ?? "",
      fields[idxPrecioCompra] ?? ""
    ];
    if (relevant.every((f) => normalizeDisplayText(f) === "")) {
      filasVacias += 1;
      return;
    }

    const perfume = normalizeDisplayText(fields[idxPerfume] ?? "");
    const marca = normalizeDisplayText(fields[idxMarca] ?? "");
    const contenido = normalizeDisplayText(fields[idxContenido] ?? "");
    const precioCompraRaw = fields[idxPrecioCompra] ?? "";
    const precioCompra = parseChileanCurrency(precioCompraRaw);

    const reasons: string[] = [];
    if (!perfume) reasons.push("Falta Perfume.");
    if (!marca) reasons.push("Falta Marca.");
    if (!contenido) reasons.push("Falta Contenido.");
    if (precioCompra === null) reasons.push("Falta un Precio Compra válido.");
    else if (precioCompra <= 0) reasons.push("Precio Compra debe ser mayor que 0.");

    if (reasons.length > 0) {
      errors.push({ rowNumber, sku: "", message: reasons.join(" ") });
      return;
    }

    rows.push({ rowNumber, perfume, marca, contenido, precioCompra: precioCompra as number });
  });

  return { rows, errors, filasFisicas: dataLines.length, filasVacias, globalErrors: [] };
}

export type MarkupValidationResult = { value: number; error: null } | { value: null; error: string };

export const DEFAULT_MARKUP_PERCENTAGE = 35;

/**
 * Valida el porcentaje de recargo SIEMPRE en el servidor (nunca confia en
 * el valor recibido del navegador): numero finito, entre 0 y 300.
 */
export function validateMarkupPercentage(raw: unknown): MarkupValidationResult {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    return { value: null, error: "El recargo debe ser un número válido." };
  }
  if (value < 0) {
    return { value: null, error: "El recargo no puede ser negativo." };
  }
  if (value > 300) {
    return { value: null, error: "El recargo no puede superar 300%." };
  }
  return { value, error: null };
}

/** precio_venta = Math.round(costo_unitario * (1 + porcentaje / 100)) */
export function calculateSalePrice(costoUnitario: number, markupPercentage: number): number {
  return Math.round(costoUnitario * (1 + markupPercentage / 100));
}

export type SupplierImportAction = "CREAR" | "ACTUALIZAR";

export type SupplierPlanRow = {
  rowNumber: number;
  sku: string;
  nombre: string;
  marca: string;
  contenido: string;
  costoUnitario: number;
  precioVenta: number;
  action: SupplierImportAction;
};

export type SupplierImportPreview = {
  perfil: "proveedor";
  porcentajeAplicado: number;
  filasFisicas: number;
  filasVacias: number;
  filasUtiles: number;
  erroresFila: AdminImportRowError[];
  plan: SupplierPlanRow[];
  resumen: { crear: number; actualizar: number; bloqueado: number };
  erroresGlobales: string[];
};

/**
 * Construye el plan de importacion de proveedor: SKU determinista via el
 * motor existente (lib/catalog-import/sku.ts), clasificacion CREAR/ACTUALIZAR
 * contra los SKU ya existentes, y precio de venta calculado con el recargo.
 * Filas cuya clave (marca+nombre+contenido) se repite dentro del mismo
 * archivo se bloquean como error (evita generar el mismo SKU dos veces).
 */
export function buildSupplierImportPlan(
  rows: SupplierImportRow[],
  markupPercentage: number,
  existingSkus: ReadonlySet<string>
): { plan: SupplierPlanRow[]; duplicateErrors: AdminImportRowError[] } {
  const seenKeys = new Map<string, number>();
  const uniqueRows: SupplierImportRow[] = [];
  const duplicateErrors: AdminImportRowError[] = [];

  for (const row of rows) {
    const key = buildReconciliationKey(row.marca, row.perfume, row.contenido);
    if (seenKeys.has(key)) {
      duplicateErrors.push({
        rowNumber: row.rowNumber,
        sku: "",
        message: `SKU duplicado dentro del archivo (mismo producto que la fila ${seenKeys.get(key)}).`
      });
      continue;
    }
    seenKeys.set(key, row.rowNumber);
    uniqueRows.push(row);
  }

  const skuMap = assignDeterministicSkus(uniqueRows, (r) => ({
    marca: r.marca,
    nombre: r.perfume,
    contenido: r.contenido
  }));

  const plan: SupplierPlanRow[] = uniqueRows.map((row) => {
    const sku = skuMap.get(row)!;
    return {
      rowNumber: row.rowNumber,
      sku,
      nombre: normalizeDisplayText(row.perfume),
      marca: normalizeDisplayText(row.marca),
      contenido: normalizeContenido(row.contenido),
      costoUnitario: row.precioCompra,
      precioVenta: calculateSalePrice(row.precioCompra, markupPercentage),
      action: existingSkus.has(sku) ? "ACTUALIZAR" : "CREAR"
    };
  });

  return { plan, duplicateErrors };
}

export function buildSupplierImportPreview(
  buffer: Buffer,
  markupPercentageRaw: unknown,
  existingSkus: ReadonlySet<string>
): SupplierImportPreview {
  const markup = validateMarkupPercentage(markupPercentageRaw ?? DEFAULT_MARKUP_PERCENTAGE);
  if (markup.error !== null) {
    return {
      perfil: "proveedor",
      porcentajeAplicado: 0,
      filasFisicas: 0,
      filasVacias: 0,
      filasUtiles: 0,
      erroresFila: [],
      plan: [],
      resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
      erroresGlobales: [markup.error]
    };
  }

  const parsed = parseSupplierCsv(buffer);
  if (parsed.globalErrors.length > 0) {
    return {
      perfil: "proveedor",
      porcentajeAplicado: markup.value,
      filasFisicas: 0,
      filasVacias: 0,
      filasUtiles: 0,
      erroresFila: [],
      plan: [],
      resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
      erroresGlobales: parsed.globalErrors
    };
  }

  const { plan, duplicateErrors } = buildSupplierImportPlan(parsed.rows, markup.value, existingSkus);
  const erroresFila = [...parsed.errors, ...duplicateErrors];

  return {
    perfil: "proveedor",
    porcentajeAplicado: markup.value,
    filasFisicas: parsed.filasFisicas,
    filasVacias: parsed.filasVacias,
    filasUtiles: parsed.rows.length,
    erroresFila,
    plan,
    resumen: {
      crear: plan.filter((p) => p.action === "CREAR").length,
      actualizar: plan.filter((p) => p.action === "ACTUALIZAR").length,
      bloqueado: erroresFila.length
    },
    erroresGlobales: []
  };
}
