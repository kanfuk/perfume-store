/**
 * Proyecto: Perfume Store
 * Modulo: Constantes
 * Descripcion: Estados, transiciones, metodos de despacho y configuracion base del negocio.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

export const ESTADO_PEDIDO_NUEVO = "NUEVO";
export const ESTADO_PEDIDO_AGENDADO = "AGENDADO";
export const ESTADO_PEDIDO_PAGADO = "PAGADO";
export const ESTADO_PEDIDO_PREPARANDO = "PREPARANDO";
export const ESTADO_PEDIDO_DESPACHADO = "DESPACHADO";
export const ESTADO_PEDIDO_ENTREGADO = "ENTREGADO";
export const ESTADO_PEDIDO_CANCELADO = "CANCELADO";

export const ESTADOS_PEDIDO = [
  ESTADO_PEDIDO_NUEVO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_PAGADO,
  ESTADO_PEDIDO_PREPARANDO,
  ESTADO_PEDIDO_DESPACHADO,
  ESTADO_PEDIDO_ENTREGADO,
  ESTADO_PEDIDO_CANCELADO
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export function isEstadoPedido(value: string): value is EstadoPedido {
  return (ESTADOS_PEDIDO as readonly string[]).includes(value);
}

/** Etiquetas visibles para cada estado de pedido (panel admin y mensajes). */
export const ESTADO_PEDIDO_LABELS: Record<EstadoPedido, string> = {
  NUEVO: "Nuevo",
  AGENDADO: "Agendado",
  PAGADO: "Pagado",
  PREPARANDO: "Preparando",
  DESPACHADO: "Despachado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado"
};

/**
 * Transiciones validas del ciclo de vida del pedido.
 * Flujo principal: NUEVO -> AGENDADO -> PAGADO -> PREPARANDO -> DESPACHADO -> ENTREGADO.
 * CANCELADO es alcanzable desde cualquier estado previo a ENTREGADO.
 * ENTREGADO y CANCELADO son estados terminales.
 */
export const ESTADO_PEDIDO_TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  NUEVO: [ESTADO_PEDIDO_AGENDADO, ESTADO_PEDIDO_CANCELADO],
  AGENDADO: [ESTADO_PEDIDO_PAGADO, ESTADO_PEDIDO_CANCELADO],
  PAGADO: [ESTADO_PEDIDO_PREPARANDO, ESTADO_PEDIDO_CANCELADO],
  PREPARANDO: [ESTADO_PEDIDO_DESPACHADO, ESTADO_PEDIDO_CANCELADO],
  DESPACHADO: [ESTADO_PEDIDO_ENTREGADO, ESTADO_PEDIDO_CANCELADO],
  ENTREGADO: [],
  CANCELADO: []
};

export const ESTADO_PAGO_SIN_PAGO = "SIN_PAGO";
export const ESTADO_PAGO_PAGADO = "PAGADO";
export const ESTADO_PAGO_CANCELADO = "CANCELADO";

export const ESTADOS_PAGO = [
  ESTADO_PAGO_SIN_PAGO,
  ESTADO_PAGO_PAGADO,
  ESTADO_PAGO_CANCELADO
] as const;

export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export function isEstadoPago(value: string): value is EstadoPago {
  return (ESTADOS_PAGO as readonly string[]).includes(value);
}

export const ESTADO_PAGO_LABELS: Record<EstadoPago, string> = {
  SIN_PAGO: "Sin pago",
  PAGADO: "Pagado",
  CANCELADO: "Cancelado"
};

export const ORIGEN_PEDIDO_PUBLICO = "PUBLICO";
export const ORIGEN_PEDIDO_ADMIN_DIRECTO = "ADMIN_DIRECTO";
export const ORIGEN_PEDIDO_PERSONALIZADO = "PERSONALIZADO";

/**
 * Metodos de despacho del negocio de perfumes.
 * STARKEN_POR_PAGAR: costo del pedido siempre 0; el destinatario paga a Starken al recibir.
 * DOMICILIO_SEMANAL: reparto semanal a domicilio, con costo unico por pedido (no por producto).
 */
export const METODO_DESPACHO_STARKEN_POR_PAGAR = "STARKEN_POR_PAGAR";
export const METODO_DESPACHO_DOMICILIO_SEMANAL = "DOMICILIO_SEMANAL";

export const METODOS_DESPACHO = [
  METODO_DESPACHO_STARKEN_POR_PAGAR,
  METODO_DESPACHO_DOMICILIO_SEMANAL
] as const;

export type MetodoDespacho = (typeof METODOS_DESPACHO)[number];

export function isMetodoDespacho(value: string): value is MetodoDespacho {
  return (METODOS_DESPACHO as readonly string[]).includes(value);
}

export const METODO_DESPACHO_LABELS: Record<MetodoDespacho, string> = {
  STARKEN_POR_PAGAR: "Starken (envío por pagar)",
  DOMICILIO_SEMANAL: "Despacho a domicilio (semanal)"
};

/**
 * Costo de referencia del despacho a domicilio semanal.
 * FALLBACK TEMPORAL: la fuente definitiva sera business_settings.costo_despacho_semanal
 * (tabla creada en supabase/migrations/20260724000000_perfume_store_foundation.sql), que
 * todavia no tiene un repositorio/servicio TypeScript en esta fase. Mientras esa integracion
 * no exista, este es el UNICO lugar del codigo que debe definir el monto de $4.000: no lo
 * repitas en componentes ni servicios.
 */
export const DOMICILIO_SEMANAL_COSTO_FALLBACK = 4000;

/**
 * Calcula el costo de despacho para un pedido segun el metodo elegido.
 * Se suma una sola vez por pedido, nunca una vez por producto.
 */
export function calcularCostoDespacho(metodoDespacho: MetodoDespacho): number {
  if (metodoDespacho === METODO_DESPACHO_STARKEN_POR_PAGAR) {
    return 0;
  }

  return DOMICILIO_SEMANAL_COSTO_FALLBACK;
}

export const HORAS_EXPIRACION_PEDIDO = 72;
