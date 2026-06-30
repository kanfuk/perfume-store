/**
 * Proyecto: Pauli Store
 * Modulo: Entorno
 * Descripcion: Helpers para detectar configuracion y parametros del entorno.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { HORAS_EXPIRACION_PEDIDO as DEFAULT_HORAS_EXPIRACION } from "@/lib/constants";
import {
  getSupabasePublishableKey,
  getSupabaseUrl
} from "@/lib/supabase/config";

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}

export function getHorasExpiracionPedido() {
  const value = Number(process.env.HORAS_EXPIRACION_PEDIDO);

  if (Number.isInteger(value) && value > 0) {
    return value;
  }

  return DEFAULT_HORAS_EXPIRACION;
}

export function getRiedmannsWhatsAppNumber() {
  return process.env.NEXT_PUBLIC_RIEDMANNS_WHATSAPP_NUMBER?.trim() || "";
}

export function getRiedmannsWhatsAppUrl() {
  const normalizedNumber = getRiedmannsWhatsAppNumber().replace(/\D/g, "");

  if (!normalizedNumber) {
    return "";
  }

  const message = encodeURIComponent(
    "Hola RiedmannsApps, quiero digitalizar mi pyme"
  );

  return `https://wa.me/${normalizedNumber}?text=${message}`;
}
