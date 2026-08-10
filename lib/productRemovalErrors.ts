/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Errores de eliminacion segura de productos (V2.2.1)
 * Descripcion: Traduce errores de las RPC archive_product_v1 /
 * hard_delete_product_v1 (supabase/migrations/20260814000000_smellme_safe_product_removal.sql)
 * a un Error tipado con codigo estable. Mismo patron que lib/perfumeOrderErrors.ts
 * y lib/weeklyClosureErrors.ts.
 */

const KNOWN_PRODUCT_REMOVAL_ERROR_CODES = new Set(["RM001", "RM002", "RM003"]);

const GENERIC_MESSAGE = "No fue posible eliminar el perfume. Intenta nuevamente.";

export class ProductRemovalError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProductRemovalError";
    this.code = code;
  }
}

export function mapProductRemovalRpcError(
  error: { code?: string; message?: string } | null | undefined
): Error {
  if (error?.code && error.message && KNOWN_PRODUCT_REMOVAL_ERROR_CODES.has(error.code)) {
    return new ProductRemovalError(error.code, error.message);
  }

  return new Error(GENERIC_MESSAGE);
}
