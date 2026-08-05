/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Banlist de clientes (Fase 7.5A)
 * Descripcion: Error seguro para rechazar un pedido publico de un cliente
 * bloqueado. El mensaje publico nunca revela la existencia de la banlist,
 * el motivo del bloqueo, cual identificador coincidio ni el administrador
 * responsable -- es identico sin importar el caso.
 */

export const CUSTOMER_BLOCKED_PUBLIC_MESSAGE =
  "No pudimos procesar tu pedido en este momento. Comunícate con nosotros por WhatsApp para recibir ayuda.";

export class CustomerBlockedError extends Error {
  readonly code = "CUSTOMER_BLOCKED";

  constructor() {
    super(CUSTOMER_BLOCKED_PUBLIC_MESSAGE);
    this.name = "CustomerBlockedError";
  }
}
