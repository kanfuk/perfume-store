/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Errores de cierres semanales (Fase 7.6A)
 * Descripcion: Traduce errores de las RPC create_weekly_closure_v1 /
 * reopen_weekly_closure_v1 a mensajes en espanol seguros, sin exponer
 * detalles internos de PostgreSQL. Mismo patron que lib/perfumeOrderErrors.ts.
 */

const KNOWN_WEEKLY_CLOSURE_ERROR_CODES = new Set(["WC001", "WC002", "WC003", "WC004", "WC005"]);

const GENERIC_MESSAGE = "No fue posible procesar el cierre semanal. Intenta nuevamente.";

export class WeeklyClosureError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WeeklyClosureError";
    this.code = code;
  }
}

export function mapWeeklyClosureRpcError(
  error: { code?: string; message?: string } | null | undefined
): Error {
  if (error?.code && error.message && KNOWN_WEEKLY_CLOSURE_ERROR_CODES.has(error.code)) {
    return new WeeklyClosureError(error.code, error.message);
  }

  return new Error(GENERIC_MESSAGE);
}

/** Codigo HTTP sugerido para cada codigo de error conocido. 400 por defecto. */
export function httpStatusForWeeklyClosureError(error: unknown): number {
  if (!(error instanceof WeeklyClosureError)) {
    return 400;
  }

  switch (error.code) {
    case "WC001":
      return 409;
    case "WC002":
      return 404;
    case "WC003":
      return 409;
    default:
      return 400;
  }
}
