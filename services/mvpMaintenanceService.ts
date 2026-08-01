import { appInfo } from "@/lib/app-info";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import {
  type CatalogBackup,
  type CatalogBackupProduct,
  catalogBackupToCsv,
  classifyStorageOrphans,
  EXPECTED_SUPABASE_PROJECT_REF,
  isExpectedSupabaseProject,
  isSafeFullResetStoragePath,
  isSafeProductStoragePath
} from "@/lib/mvp-maintenance";
import { PRODUCT_IMAGE_CONFIG } from "@/lib/product-image-config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/config";

type ProductRow = {
  id: string; sku: string | null; nombre: string; marca: string | null;
  contenido: string | null; descripcion: string | null; precio_venta: number;
  precio_anterior: number | null; costo_unitario: number; stock_actual: number;
  stock_reservado: number; stock_minimo: number; activo: boolean; es_top: boolean;
  es_oferta_semana: boolean; orden_destacado: number | null; tipo_producto: string | null;
  modo_precio: string; image_url: string | null; image_storage_path: string | null;
  created_at: string; updated_at: string;
};

function mapBackupProduct(row: ProductRow): CatalogBackupProduct {
  return {
    id: row.id, sku: row.sku, nombre: row.nombre, marca: row.marca,
    contenido: row.contenido, descripcion: row.descripcion, precioVenta: row.precio_venta,
    precioAnterior: row.precio_anterior, costoUnitario: row.costo_unitario,
    stockActual: row.stock_actual, stockReservado: row.stock_reservado,
    stockMinimo: row.stock_minimo, activo: row.activo, esTop: row.es_top,
    esOfertaSemana: row.es_oferta_semana, ordenDestacado: row.orden_destacado,
    tipoProducto: row.tipo_producto, modoPrecio: row.modo_precio, imageUrl: row.image_url,
    imageStoragePath: row.image_storage_path, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function unwrapRpc(data: unknown) {
  if (Array.isArray(data) && data.length === 1) return data[0];
  return data;
}

export class MvpMaintenanceService {
  async fullOperationalResetPreview() {
    this.assertExpectedProject();
    const [{ data, error }, storedPaths] = await Promise.all([
      createSupabaseServerClient().rpc("preview_smellme_full_operational_reset_v1"),
      this.listManagedStoragePaths()
    ]);
    if (error) throw new Error("FULLRESET500: no fue posible generar el preview del reset total.");
    const preview = (unwrapRpc(data) ?? {}) as Record<string, unknown>;
    return { ...preview, storageFiles: storedPaths.filter(isSafeFullResetStoragePath).length };
  }

  async fullOperationalBackupFile() {
    this.assertExpectedProject();
    const { data, error } = await createSupabaseServerClient().rpc("prepare_smellme_full_operational_backup_v1");
    if (error) throw new Error("FULLRESET500: no fue posible generar el respaldo técnico.");
    const result = (unwrapRpc(data) ?? {}) as { backupId?: unknown; fingerprint?: unknown; previewFingerprint?: unknown; payload?: unknown };
    if (typeof result.backupId !== "string" || typeof result.fingerprint !== "string" ||
        typeof result.previewFingerprint !== "string" || !result.payload) {
      throw new Error("FULLRESET500: el respaldo técnico quedó incompleto.");
    }
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
    return {
      body: JSON.stringify(result.payload, null, 2),
      contentType: "application/json; charset=utf-8",
      filename: `smellme-pre-full-reset-backup-${stamp}.json`,
      backupId: result.backupId,
      fingerprint: result.fingerprint,
      previewFingerprint: result.previewFingerprint
    };
  }

  async fullOperationalReset(input: { idempotencyKey: string; backupId: string; backupFingerprint: string; expectedFingerprint: string }) {
    this.assertExpectedProject();
    const client = createSupabaseServerClient();
    const { data, error } = await client.rpc("reset_smellme_full_operational_data_v1", {
      p_confirmation: "ELIMINAR TODA LA DATA OPERATIVA",
      p_idempotency_key: input.idempotencyKey,
      p_backup_id: input.backupId,
      p_backup_fingerprint: input.backupFingerprint,
      p_expected_fingerprint: input.expectedFingerprint
    });
    if (error) {
      if (error.message.includes("FULLRESET006")) throw new Error("FULLRESET006: los datos cambiaron; genera preview y respaldo nuevos.");
      throw new Error("FULLRESET500: no fue posible completar el reset total.");
    }
    const result = (unwrapRpc(data) ?? {}) as { imagePaths?: unknown; preserved?: unknown };
    const returnedPaths = Array.isArray(result.imagePaths) ? result.imagePaths.filter(isSafeFullResetStoragePath) : [];
    const storedPaths = await this.listManagedStoragePaths();
    const paths = [...new Set([...returnedPaths, ...storedPaths.filter(isSafeFullResetStoragePath)])];

    if (paths.length > 0) {
      const rows = paths.map((storagePath) => ({ idempotency_key: input.idempotencyKey, storage_path: storagePath, status: "PENDING" }));
      const pending = await client.from("smellme_full_reset_storage_pending").upsert(rows, { onConflict: "idempotency_key,storage_path", ignoreDuplicates: true });
      if (pending.error) throw new Error("STORAGE500: la base quedó vacía, pero no fue posible registrar todos los paths pendientes.");
      for (let index = 0; index < paths.length; index += 100) {
        const chunk = paths.slice(index, index + 100);
        const removal = await client.storage.from(PRODUCT_IMAGE_CONFIG.bucket).remove(chunk);
        if (removal.error) throw new Error("STORAGE500: la base quedó vacía, pero algunas imágenes siguen pendientes.");
        const completed = await client.from("smellme_full_reset_storage_pending")
          .update({ status: "DELETED", completed_at: new Date().toISOString() })
          .eq("idempotency_key", input.idempotencyKey).in("storage_path", chunk);
        if (completed.error) throw new Error("STORAGE500: Storage quedó limpio, pero falló su registro de auditoría.");
      }
    }
    const remainingPaths = (await this.listManagedStoragePaths()).filter(isSafeFullResetStoragePath);
    if (remainingPaths.length > 0) throw new Error("STORAGE500: quedaron objetos administrados pendientes.");
    return { ...result, storageFilesDeleted: paths.length, storageFilesRemaining: 0 };
  }

  async qaPreview() {
    this.assertSupabase();
    const { data, error } = await createSupabaseServerClient().rpc("preview_smellme_qa_cleanup_v1");
    if (error) throw new Error("QA500: no fue posible generar la vista previa QA.");
    return unwrapRpc(data);
  }

  async qaCleanup(idempotencyKey: string) {
    this.assertSupabase();
    const client = createSupabaseServerClient();
    const { data, error } = await client.rpc("cleanup_smellme_qa_data_v1", { p_idempotency_key: idempotencyKey });
    if (error) throw new Error("QA500: no fue posible completar la limpieza QA.");
    const result = (unwrapRpc(data) ?? {}) as { storagePaths?: unknown };
    const storagePaths = Array.isArray(result.storagePaths) ? result.storagePaths.filter(isSafeProductStoragePath) : [];
    if (storagePaths.length > 0) {
      const removal = await client.storage.from(PRODUCT_IMAGE_CONFIG.bucket).remove(storagePaths);
      if (removal.error) throw new Error("STORAGE500: la base se limpió, pero no fue posible retirar todas las imágenes QA.");
    }
    return { ...result, storageFilesDeleted: storagePaths.length };
  }

  async catalogBackup(): Promise<CatalogBackup> {
    const generatedAt = new Date().toISOString();
    if (!isSupabaseConfigured()) {
      const products: CatalogBackupProduct[] = localStore.products.map((product) => ({
        id: product.id, sku: product.sku ?? null, nombre: product.nombre, marca: product.marca ?? null,
        contenido: product.contenido ?? null, descripcion: product.descripcion ?? null,
        precioVenta: product.precioVenta, precioAnterior: product.precioAnterior ?? null,
        costoUnitario: product.costoUnitario ?? 0, stockActual: product.stockActual ?? 0,
        stockReservado: product.stockReservado ?? 0, stockMinimo: product.stockMinimo ?? 0,
        activo: product.activo ?? true, esTop: product.esTop ?? false,
        esOfertaSemana: product.esOfertaSemana ?? false, ordenDestacado: product.ordenDestacado ?? null,
        tipoProducto: product.tipoProducto ?? null, modoPrecio: product.modoPrecio ?? "AUTO",
        imageUrl: product.imageUrl ?? null, imageStoragePath: product.imageStoragePath ?? null,
        createdAt: product.createdAt?.toISOString() ?? generatedAt,
        updatedAt: product.updatedAt?.toISOString() ?? generatedAt
      }));
      return { schemaVersion: "smellme-catalog-backup-v1", appVersion: appInfo.version, generatedAt, productCount: products.length, products };
    }

    const { data, error } = await createSupabaseServerClient().from("productos").select(
      "id,sku,nombre,marca,contenido,descripcion,precio_venta,precio_anterior,costo_unitario,stock_actual,stock_reservado,stock_minimo,activo,es_top,es_oferta_semana,orden_destacado,tipo_producto,modo_precio,image_url,image_storage_path,created_at,updated_at"
    ).order("nombre", { ascending: true });
    if (error) throw new Error("MVP500: no fue posible exportar el catálogo.");
    const products = (data as ProductRow[]).map(mapBackupProduct);
    return { schemaVersion: "smellme-catalog-backup-v1", appVersion: appInfo.version, generatedAt, productCount: products.length, products };
  }

  async catalogBackupFile(format: "json" | "csv") {
    const backup = await this.catalogBackup();
    const stamp = backup.generatedAt.replaceAll(/[:.]/g, "-");
    return format === "csv"
      ? { body: catalogBackupToCsv(backup), contentType: "text/csv; charset=utf-8", filename: `smellme-catalog-backup-${stamp}.csv` }
      : { body: JSON.stringify(backup, null, 2), contentType: "application/json; charset=utf-8", filename: `smellme-catalog-backup-${stamp}.json` };
  }

  async catalogResetPreview() {
    this.assertSupabase();
    const { data, error } = await createSupabaseServerClient().rpc("preview_smellme_catalog_reset_v1");
    if (error) throw new Error("RESET500: no fue posible clasificar el catálogo.");
    return unwrapRpc(data);
  }

  async catalogReset(idempotencyKey: string, expectedFingerprint: string) {
    this.assertSupabase();
    const client = createSupabaseServerClient();
    const { data, error } = await client.rpc("reset_smellme_catalog_v1", {
      p_idempotency_key: idempotencyKey, p_expected_fingerprint: expectedFingerprint
    });
    if (error) throw new Error("RESET500: no fue posible completar el reinicio seguro.");
    const result = (unwrapRpc(data) ?? {}) as { storagePaths?: unknown };
    const paths = Array.isArray(result.storagePaths) ? result.storagePaths.filter(isSafeProductStoragePath) : [];
    if (paths.length > 0) {
      const removal = await client.storage.from(PRODUCT_IMAGE_CONFIG.bucket).remove(paths);
      if (removal.error) throw new Error("STORAGE500: el catálogo se reinició, pero algunas imágenes requieren revisión manual.");
    }
    return { ...result, storageFilesDeleted: paths.length };
  }

  async storageOrphans() {
    this.assertSupabase();
    const client = createSupabaseServerClient();
    const [{ data, error }, storedPaths] = await Promise.all([
      client.from("productos").select("image_storage_path").not("image_storage_path", "is", null),
      this.listManagedStoragePaths()
    ]);
    if (error) throw new Error("STORAGE500: no fue posible leer las referencias de imágenes.");
    const referenced = (data ?? []).map((row) => row.image_storage_path).filter(isSafeProductStoragePath);
    return classifyStorageOrphans(storedPaths, referenced);
  }

  async cleanupStorageOrphans(idempotencyKey: string) {
    this.assertSupabase();
    const client = createSupabaseServerClient();
    const claim = await client.rpc("claim_smellme_storage_cleanup_v1", { p_idempotency_key: idempotencyKey });
    if (claim.error) throw new Error("STORAGE500: no fue posible iniciar la limpieza idempotente.");
    const claimed = (unwrapRpc(claim.data) ?? {}) as { replayed?: boolean; result?: unknown };
    if (claimed.replayed && claimed.result) return claimed.result;
    if (claimed.replayed) throw new Error("STORAGE409: ya existe una limpieza en curso para esta clave.");

    const firstPass = await this.storageOrphans();
    const secondPass = await this.storageOrphans();
    const stillOrphan = new Set(secondPass.orphanPaths);
    const paths = firstPass.orphanPaths.filter((path) => stillOrphan.has(path) && isSafeProductStoragePath(path));
    if (paths.length > 0) {
      const removal = await client.storage.from(PRODUCT_IMAGE_CONFIG.bucket).remove(paths);
      if (removal.error) throw new Error("STORAGE500: no fue posible borrar los archivos huérfanos.");
    }
    const result = { replayed: false, deleted: paths.length, deletedPaths: paths };
    const completion = await client.rpc("complete_smellme_storage_cleanup_v1", { p_idempotency_key: idempotencyKey, p_result: result });
    if (completion.error) throw new Error("STORAGE500: no fue posible registrar el resultado de Storage.");
    return result;
  }

  private async listManagedStoragePaths() {
    const client = createSupabaseServerClient();
    const bucket = client.storage.from(PRODUCT_IMAGE_CONFIG.bucket);
    const queue: string[] = [PRODUCT_IMAGE_CONFIG.storagePathPrefix];
    const paths: string[] = [];
    let visited = 0;
    while (queue.length > 0) {
      const prefix = queue.shift() as string;
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error("STORAGE500: no fue posible inventariar las imágenes administradas.");
        for (const item of data ?? []) {
          const path = `${prefix}/${item.name}`;
          if (item.id || item.metadata) paths.push(path); else queue.push(path);
          visited += 1;
          if (visited > 20_000) throw new Error("STORAGE413: el inventario excede el límite seguro.");
        }
        if (!data || data.length < 100) break;
      }
    }
    return paths;
  }

  private assertSupabase() {
    if (!isSupabaseConfigured()) throw new Error("MVP503: Supabase no está configurado para esta operación.");
  }

  private assertExpectedProject() {
    this.assertSupabase();
    if (!isExpectedSupabaseProject(getSupabaseUrl())) {
      throw new Error(`FULLRESET412: el proyecto Supabase no coincide con ${EXPECTED_SUPABASE_PROJECT_REF}.`);
    }
  }
}

export function createMvpMaintenanceService() {
  return new MvpMaintenanceService();
}
