/**
 * Proyecto: Perfume Store
 * Modulo: Gestion administrativa de clientes
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Cliente } from "@/domain/Cliente";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import { parseChileanRut } from "@/lib/rut";
import { isValidEmail } from "@/lib/validators";
import type { AdminCustomerOption } from "@/lib/types";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import { getClienteRepository } from "@/repositories/clienteRepository";

export type UpdateAdminCustomerInput = {
  id: string;
  nombre: string;
  rut?: string;
  email?: string;
  telefono?: string;
  region?: string;
  comuna?: string;
  direccion?: string;
  referenciaDireccion?: string;
  lugarTrabajo?: string;
};

const MOTIVO_BLOQUEO_MIN_LENGTH = 5;
const MOTIVO_BLOQUEO_MAX_LENGTH = 500;

function toAdminCustomerOption(cliente: Cliente, id: string): AdminCustomerOption {
  return {
    id,
    nombre: cliente.nombre,
    rut: cliente.rut,
    email: cliente.email,
    telefono: cliente.telefono,
    region: cliente.region,
    comuna: cliente.comuna,
    direccion: cliente.direccion,
    referenciaDireccion: cliente.referenciaDireccion,
    lugarTrabajo: cliente.lugarTrabajo,
    bloqueado: cliente.bloqueado,
    motivoBloqueo: cliente.motivoBloqueo ?? undefined,
    bloqueadoEn: cliente.bloqueadoEn ? cliente.bloqueadoEn.toISOString() : undefined,
    desbloqueadoEn: cliente.desbloqueadoEn ? cliente.desbloqueadoEn.toISOString() : undefined
  };
}

/**
 * Valida el motivo de bloqueo (Fase 7.5A, seccion 5): obligatorio, string,
 * trim, entre 5 y 500 caracteres. Nunca acepta vacio, solo espacios, ni un
 * valor no-string (el body de la API llega como `unknown`).
 */
function parseMotivoBloqueo(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("El motivo del bloqueo es obligatorio.");
  }

  const motivo = raw.trim();

  if (!motivo) {
    throw new Error("El motivo del bloqueo es obligatorio.");
  }

  if (motivo.length < MOTIVO_BLOQUEO_MIN_LENGTH) {
    throw new Error(`El motivo del bloqueo debe tener al menos ${MOTIVO_BLOQUEO_MIN_LENGTH} caracteres.`);
  }

  if (motivo.length > MOTIVO_BLOQUEO_MAX_LENGTH) {
    throw new Error(`El motivo del bloqueo no puede superar los ${MOTIVO_BLOQUEO_MAX_LENGTH} caracteres.`);
  }

  return motivo;
}

export class AdminCustomerService {
  constructor(private readonly clienteRepository: ClienteRepository) {}

  async actualizarCliente(input: UpdateAdminCustomerInput): Promise<AdminCustomerOption> {
    const rawPhone = input.telefono?.trim() ?? "";
    const normalizedPhone = rawPhone
      ? parseChileanMobilePhone(rawPhone)?.e164 ?? null
      : "";

    if (rawPhone && !normalizedPhone) {
      throw new Error("Ingresa un celular chileno valido o deja el campo vacio.");
    }

    const rawRut = input.rut?.trim() ?? "";
    const normalizedRut = rawRut ? parseChileanRut(rawRut)?.normalized ?? null : "";

    if (rawRut && !normalizedRut) {
      throw new Error("Ingresa un RUT chileno valido o deja el campo vacio.");
    }

    const rawEmail = input.email?.trim() ?? "";

    if (rawEmail && !isValidEmail(rawEmail)) {
      throw new Error("Ingresa un correo electronico valido o deja el campo vacio.");
    }

    // Editar datos personales nunca debe tocar el estado de bloqueo: se lee
    // el estado actual y se conserva tal cual en la ficha reconstruida y en
    // la respuesta (Fase 7.5A). actualizarCliente() en el repositorio de
    // todas formas no escribe estas columnas, pero sin este paso la
    // respuesta echoed-back mostraria "bloqueado: false" aunque el cliente
    // siguiera bloqueado.
    const actual = await this.clienteRepository.buscarClientePorId(input.id);

    const cliente = new Cliente({
      id: input.id,
      nombre: input.nombre.trim(),
      rut: normalizedRut ?? "",
      email: rawEmail.toLowerCase(),
      telefono: normalizedPhone ?? "",
      region: input.region?.trim(),
      comuna: input.comuna?.trim(),
      direccion: input.direccion?.trim(),
      referenciaDireccion: input.referenciaDireccion?.trim(),
      lugarTrabajo: input.lugarTrabajo?.trim(),
      bloqueado: actual?.bloqueado,
      motivoBloqueo: actual?.motivoBloqueo,
      bloqueadoEn: actual?.bloqueadoEn,
      desbloqueadoEn: actual?.desbloqueadoEn,
      bloqueadoPor: actual?.bloqueadoPor
    });

    const result = await this.clienteRepository.actualizarCliente(cliente);

    return toAdminCustomerOption(cliente, result.id);
  }

  /**
   * Banlist (Fase 7.5A, seccion 5): bloquea a un cliente existente. Motivo
   * obligatorio (ver parseMotivoBloqueo). Idempotente: bloquear a alguien ya
   * bloqueado solo actualiza motivo/fecha/admin responsable -- nunca crea
   * un segundo registro ni dos veces el mismo estado.
   */
  async bloquearCliente(input: { id: unknown; motivo: unknown; bloqueadoPor: string | null }) {
    if (typeof input.id !== "string" || !input.id.trim()) {
      throw new Error("Selecciona un cliente para bloquear.");
    }

    const motivo = parseMotivoBloqueo(input.motivo);
    const actual = await this.clienteRepository.buscarClientePorId(input.id);

    if (!actual) {
      throw new Error("Cliente no encontrado.");
    }

    actual.bloquear(motivo, input.bloqueadoPor);

    const actualizado = await this.clienteRepository.actualizarEstadoBloqueo(input.id, {
      bloqueado: actual.bloqueado,
      motivoBloqueo: actual.motivoBloqueo,
      bloqueadoEn: actual.bloqueadoEn,
      desbloqueadoEn: actual.desbloqueadoEn,
      bloqueadoPor: actual.bloqueadoPor
    });

    return toAdminCustomerOption(actualizado, input.id);
  }

  /**
   * Banlist: retira el bloqueo. Idempotente sobre un cliente ya
   * desbloqueado. Nunca borra motivoBloqueo/bloqueadoEn (referencia
   * administrativa del ultimo bloqueo).
   */
  async desbloquearCliente(id: unknown) {
    if (typeof id !== "string" || !id.trim()) {
      throw new Error("Selecciona un cliente para desbloquear.");
    }

    const actual = await this.clienteRepository.buscarClientePorId(id);

    if (!actual) {
      throw new Error("Cliente no encontrado.");
    }

    actual.desbloquear();

    const actualizado = await this.clienteRepository.actualizarEstadoBloqueo(id, {
      bloqueado: actual.bloqueado,
      motivoBloqueo: actual.motivoBloqueo,
      bloqueadoEn: actual.bloqueadoEn,
      desbloqueadoEn: actual.desbloqueadoEn,
      bloqueadoPor: actual.bloqueadoPor
    });

    return toAdminCustomerOption(actualizado, id);
  }
}

export function createAdminCustomerService() {
  return new AdminCustomerService(getClienteRepository());
}
