import { Cliente } from "@/domain/Cliente";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import type { AdminCustomerOption } from "@/lib/types";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import { getClienteRepository } from "@/repositories/clienteRepository";

export type UpdateAdminCustomerInput = {
  id: string;
  nombre: string;
  telefono?: string;
  lugarTrabajo: string;
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

    const cliente = new Cliente({
      id: input.id,
      nombre: input.nombre.trim(),
      telefono: normalizedPhone ?? "",
      lugarTrabajo: input.lugarTrabajo.trim()
    });

    const result = await this.clienteRepository.actualizarCliente(cliente);

    return {
      id: result.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      lugarTrabajo: cliente.lugarTrabajo
    };
  }
}

export function createAdminCustomerService() {
  return new AdminCustomerService(getClienteRepository());
}
