import { PRODUCT_IMAGE_CONFIG, isManagedProductImageStoragePath } from "@/lib/product-image-config";

export const QA_CLEANUP_CONFIRMATION = "ELIMINAR DATOS DE PRUEBA";
export const CATALOG_RESET_CONFIRMATION = "REINICIAR CATALOGO SMELLME";
export const ORPHAN_CLEANUP_CONFIRMATION = "ELIMINAR ARCHIVOS HUERFANOS";
export const FULL_OPERATIONAL_RESET_CONFIRMATION = "ELIMINAR TODA LA DATA OPERATIVA";
export const EXPECTED_SUPABASE_PROJECT_REF = "nxgkudvrotlaqvvhygem";
export const QA_IDEMPOTENCY_PREFIX = "QA-";
export const DOCUMENTED_QA_CUSTOMER_NAMES = ["QA Smellme Full Flow"] as const;

export type QaEvidenceInput = {
  name?: string | null;
  sku?: string | null;
  email?: string | null;
  idempotencyKey?: string | null;
  observation?: string | null;
  imageStoragePath?: string | null;
  explicitlyRegistered?: boolean;
};

export type QaClassification = {
  isQa: boolean;
  evidence: string[];
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function classifyQaEvidence(input: QaEvidenceInput): QaClassification {
  const evidence: string[] = [];
  const name = normalized(input.name);
  const sku = normalized(input.sku);
  const email = normalized(input.email);
  const idempotencyKey = normalized(input.idempotencyKey);
  const observation = normalized(input.observation);
  const imageStoragePath = normalized(input.imageStoragePath);

  if (name.startsWith("zztest") || sku.startsWith("zztest")) evidence.push("ZZTEST");
  if (DOCUMENTED_QA_CUSTOMER_NAMES.some((value) => name === value.toLowerCase())) {
    evidence.push("NOMBRE_QA_DOCUMENTADO");
  }
  if (/^[^@\s]+@example\.com$/.test(email)) evidence.push("EMAIL_HARNESS_EXAMPLE_COM");
  if (idempotencyKey.startsWith(QA_IDEMPOTENCY_PREFIX.toLowerCase())) evidence.push("IDEMPOTENCIA_QA");
  if (observation.startsWith("zztest") || observation.startsWith("qa:")) evidence.push("PEDIDO_QA_EXPLICITO");
  if (imageStoragePath.startsWith("products/qa/") || imageStoragePath.startsWith("qa/")) evidence.push("RUTA_STORAGE_QA");
  if (input.explicitlyRegistered) evidence.push("ID_QA_REGISTRADO");

  return { isQa: evidence.length > 0, evidence };
}

export type CatalogBackupProduct = {
  id: string;
  sku: string | null;
  nombre: string;
  marca: string | null;
  contenido: string | null;
  descripcion: string | null;
  precioVenta: number;
  precioAnterior: number | null;
  costoUnitario: number;
  stockActual: number;
  stockReservado: number;
  stockMinimo: number;
  activo: boolean;
  esTop: boolean;
  esOfertaSemana: boolean;
  ordenDestacado: number | null;
  tipoProducto: string | null;
  modoPrecio: string;
  imageUrl: string | null;
  imageStoragePath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogBackup = {
  schemaVersion: "smellme-catalog-backup-v1";
  appVersion: string;
  generatedAt: string;
  productCount: number;
  products: CatalogBackupProduct[];
};

const CSV_FIELDS: Array<keyof CatalogBackupProduct> = [
  "id", "sku", "nombre", "marca", "contenido", "descripcion", "precioVenta",
  "precioAnterior", "costoUnitario", "stockActual", "stockReservado", "stockMinimo",
  "activo", "esTop", "esOfertaSemana", "ordenDestacado", "tipoProducto", "modoPrecio",
  "imageUrl", "imageStoragePath", "createdAt", "updatedAt"
];

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function catalogBackupToCsv(backup: CatalogBackup) {
  const header = CSV_FIELDS.map(csvCell).join(",");
  const rows = backup.products.map((product) => CSV_FIELDS.map((field) => csvCell(product[field])).join(","));
  return [header, ...rows].join("\r\n");
}

export function hasOnlyFields(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).every((field) => allowed.includes(field));
}

export function isValidIdempotencyKey(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$/.test(value);
}

export function isSafeProductStoragePath(value: unknown): value is string {
  if (typeof value !== "string" || !isManagedProductImageStoragePath(value)) return false;
  if (value.length > 512 || value.includes("\\") || value.split("/").includes("..")) return false;
  return value.startsWith(`${PRODUCT_IMAGE_CONFIG.storagePathPrefix}/`) && /\.webp$/i.test(value);
}

export function isSafeFullResetStoragePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${PRODUCT_IMAGE_CONFIG.storagePathPrefix}/`) &&
    value.length <= 512 && !value.includes("\\") && !value.split("/").includes("..");
}

export function resolveSupabaseProjectRef(url: string | null | undefined) {
  if (!url) return "";
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

export function isExpectedSupabaseProject(url: string | null | undefined) {
  return resolveSupabaseProjectRef(url) === EXPECTED_SUPABASE_PROJECT_REF;
}

export function classifyStorageOrphans(storedPaths: readonly string[], referencedPaths: readonly string[]) {
  const referenced = new Set(referencedPaths.filter(isSafeProductStoragePath));
  const stored = [...new Set(storedPaths)].sort();
  const safeStored = stored.filter(isSafeProductStoragePath);
  const qaExcludedPaths = safeStored.filter((path) => path.toLowerCase().startsWith("products/qa/"));
  return {
    bucket: PRODUCT_IMAGE_CONFIG.bucket,
    prefix: `${PRODUCT_IMAGE_CONFIG.storagePathPrefix}/`,
    referencedCount: referenced.size,
    storedCount: stored.length,
    invalidCount: stored.filter((path) => path.startsWith(`${PRODUCT_IMAGE_CONFIG.storagePathPrefix}/`) && !isSafeProductStoragePath(path)).length,
    outsidePrefixCount: stored.filter((path) => !path.startsWith(`${PRODUCT_IMAGE_CONFIG.storagePathPrefix}/`)).length,
    qaExcludedCount: qaExcludedPaths.length,
    orphanPaths: safeStored.filter((path) => !referenced.has(path) && !qaExcludedPaths.includes(path))
  };
}

export function abbreviateId(value: string) {
  return value.length <= 12 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}
