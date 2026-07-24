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
      lugarTrabajo: input.lugarTrabajo?.trim()
    });

    const result = await this.clienteRepository.actualizarCliente(cliente);

    return {
      id: result.id,
      nombre: cliente.nombre,
      rut: cliente.rut,
      email: cliente.email,
      telefono: cliente.telefono,
      region: cliente.region,
      comuna: cliente.comuna,
      direccion: cliente.direccion,
      referenciaDireccion: cliente.referenciaDireccion,
      lugarTrabajo: cliente.lugarTrabajo
    };
  }
}

export function createAdminCustomerService() {
  return new AdminCustomerService(getClienteRepository());
}
