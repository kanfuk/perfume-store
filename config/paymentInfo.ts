/**
 * Datos bancarios para transferencia manual.
 *
 * Vacio a proposito: los valores reales de Pauli Store (titular, RUT, banco,
 * numero de cuenta y correo) se eliminaron en la Fase 1B porque son datos
 * financieros reales de una persona de otro negocio y no corresponden a
 * Perfume Store. La fuente definitiva sera business_settings (tabla creada
 * en supabase/migrations/20260724000000_perfume_store_foundation.sql), que
 * todavia no tiene un repositorio/servicio TypeScript conectado.
 *
 * No completar este archivo con datos reales todavia: hasta que exista la
 * integracion con business_settings, cualquier valor puesto aqui quedaria
 * hardcodeado en el bundle de la aplicacion.
 */
export const paymentInfo = {
  accountHolder: "",
  rut: "",
  bank: "",
  accountType: "",
  accountNumber: "",
  email: ""
} as const;
