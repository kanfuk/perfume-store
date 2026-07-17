import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import { AdminCustomerService } from "@/services/adminCustomerService";

class ClienteRepositoryStub implements ClienteRepository {
  public updatedCustomer: Cliente | null = null;

  async upsertCliente(cliente: Cliente) {
    return { id: cliente.id ?? "cliente-1" };
  }

  async buscarClienteRelacionado() {
    return null;
  }

  async actualizarCliente(cliente: Cliente) {
    this.updatedCustomer = cliente;
    return { id: cliente.id ?? "cliente-1" };
  }
}

describe("AdminCustomerService", () => {
  it("normaliza el telefono antes de actualizar un cliente", async () => {
    const repository = new ClienteRepositoryStub();
    const service = new AdminCustomerService(repository);

    const result = await service.actualizarCliente({
      id: "cliente-1",
      nombre: "  rodriGO  ",
      telefono: "9 1234 5678",
      lugarTrabajo: " Finanzas "
    });

    expect(repository.updatedCustomer?.telefono).toBe("+56912345678");
    expect(result.telefono).toBe("+56912345678");
    expect(result.nombre).toBe("rodriGO");
    expect(result.lugarTrabajo).toBe("Finanzas");
  });

  it("permite limpiar el telefono del cliente", async () => {
    const repository = new ClienteRepositoryStub();
    const service = new AdminCustomerService(repository);

    const result = await service.actualizarCliente({
      id: "cliente-1",
      nombre: "Claudia",
      telefono: "   ",
      lugarTrabajo: "Recepcion"
    });

    expect(repository.updatedCustomer?.telefono).toBe("");
    expect(result.telefono).toBe("");
  });

  it("rechaza telefonos chilenos invalidos", async () => {
    const repository = new ClienteRepositoryStub();
    const service = new AdminCustomerService(repository);

    await expect(
      service.actualizarCliente({
        id: "cliente-1",
        nombre: "Claudia",
        telefono: "12345",
        lugarTrabajo: "Recepcion"
      })
    ).rejects.toThrow("Ingresa un celular chileno valido o deja el campo vacio.");
  });
});
