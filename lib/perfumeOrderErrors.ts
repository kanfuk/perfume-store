/**
 * Proyecto: Perfume Store
 * Modulo: Errores de pedidos transaccionales
 * Descripcion: Traduce errores de las RPC de Postgres (create/mark_paid/
 * cancel/advance_perfume_order_*_v1) a mensajes en espanol seguros para
 * mostrar al usuario, sin exponer detalles internos de PostgreSQL.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

/**
 * Codigos de error definidos por las RPC de Perfume Store (SQLSTATE
 * personalizados, ver supabase/migrations/20260724010000_perfume_store_transactional_stock.sql).
 * Solo para estos codigos se confia en el mensaje que llega desde Postgres
 * (fueron escritos a proposito en espanol y sin detalles internos). Para
 * cualquier otro error (constraint generico, error de conexion, etc.) se
 * usa un mensaje generico.
 */
const KNOWN_PERFUME_ORDER_ERROR_CODES = new Set([
  "PF001",
  "PF002",
  "PF003",
  "PF004",
  "PF005",
  "PF006",
  "PF007",
  "PF008",
  "PF009",
  "PF010",
  "PF011",
  "PF012",
  "PF013",
  "PF015"
]);

const GENERIC_MESSAGE = "No fue posible procesar el pedido. Intenta nuevamente.";

export class PerfumeOrderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PerfumeOrderError";
    this.code = code;
  }
}

/**
 * Traduce el error crudo devuelto por supabase.rpc(...) a un Error seguro
 * para propagar hacia la ruta API y finalmente al usuario.
 */
export function mapPerfumeOrderRpcError(
  error: { code?: string; message?: string } | null | undefined
): Error {
  if (error?.code && error.message && KNOWN_PERFUME_ORDER_ERROR_CODES.has(error.code)) {
    return new PerfumeOrderError(error.code, error.message);
  }

  return new Error(GENERIC_MESSAGE);
}

/** Codigo HTTP sugerido para cada codigo de error conocido. 400 por defecto. */
export function httpStatusForPerfumeOrderError(error: unknown): number {
  if (!(error instanceof PerfumeOrderError)) {
    return 400;
  }

  switch (error.code) {
    case "PF009":
      return 404;
    case "PF005":
    case "PF010":
    case "PF011":
    case "PF013":
      return 409;
    default:
      return 400;
  }
}
