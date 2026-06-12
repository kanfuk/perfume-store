/**
 * Proyecto: Pauli Store
 * Modulo: Constantes
 * Descripcion: Constantes compartidas de estados y configuracion base del negocio.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

export const ESTADO_PEDIDO_PENDIENTE = "PENDIENTE";
export const ESTADO_PEDIDO_AGENDADO = "AGENDADO";
export const ESTADO_PEDIDO_FINALIZADO = "FINALIZADO";
export const ESTADO_PEDIDO_CANCELADO = "CANCELADO";

export const ESTADO_PAGO_SIN_PAGO = "SIN_PAGO";
export const ESTADO_PAGO_PAGADO = "PAGADO";
export const ESTADO_PAGO_FIADO = "FIADO";

export const HORAS_EXPIRACION_PEDIDO = 72;
