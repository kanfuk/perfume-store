import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import type { ClienteRepository, EstadoBloqueoCambios } from "@/repositories/clienteRepository";
import { AdminCustomerService } from "@/services/adminCustomerService";

class ClienteRepositoryStub implements ClienteRepository {
  public updatedCustomer: Cliente | null = null;
  private readonly clientes = new Map<string, Cliente>();

  seed(cliente: Cliente) {
    this.clientes.set(cliente.id as string, cliente);
  }

  async upsertCliente(cliente: Cliente) {
    return { id: cliente.id ?? "cliente-1" };
  }

  async buscarClienteRelacionado() {
    return null;
  }

  async actualizarCliente(cliente: Cliente) {
    this.updatedCustomer = cliente;
    if (cliente.id) this.clientes.set(cliente.id, cliente);
    return { id: cliente.id ?? "cliente-1" };
  }

  async buscarClientePorId(id: string) {
    return this.clientes.get(id) ?? null;
  }

  async actualizarEstadoBloqueo(clienteId: string, cambios: EstadoBloqueoCambios) {
    const current = this.clientes.get(clienteId);

    if (!current) {
      throw new Error("Cliente no encontrado.");
    }

    const updated = new Cliente({
      id: current.id,
      nombre: current.nombre,
      rut: current.rut,
      email: current.email,
      telefono: current.telefono,
      region: current.region,
      comuna: current.comuna,
      direccion: current.direccion,
      referenciaDireccion: current.referenciaDireccion,
      lugarTrabajo: current.lugarTrabajo,
      bloqueado: cambios.bloqueado,
      motivoBloqueo: cambios.motivoBloqueo,
      bloqueadoEn: cambios.bloqueadoEn,
      desbloqueadoEn: cambios.desbloqueadoEn,
      bloqueadoPor: cambios.bloqueadoPor
    });

    this.clientes.set(clienteId, updated);
    return updated;
  }

  async buscarClienteBloqueadoPorIdentidad() {
    return null;
  }
}

function seedCliente(repository: ClienteRepositoryStub, overrides: Partial<ConstructorParameters<typeof Cliente>[0]> = {}) {
  const cliente = new Cliente({
    id: "cliente-1",
    nombre: "Claudia",
    telefono: "+56912345678",
    lugarTrabajo: "Recepcion",
    ...overrides
  });
  repository.seed(cliente);
  return cliente;
}

describe("AdminCustomerService - actualizarCliente", () => {
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

  it("editar datos personales conserva el estado de bloqueo (Fase 7.5A: no lo toca ni lo pierde en la respuesta)", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository, {
      bloqueado: true,
      motivoBloqueo: "Pedidos repetidos sin retiro",
      bloqueadoEn: new Date("2026-08-01T00:00:00.000Z")
    });
    const service = new AdminCustomerService(repository);

    const result = await service.actualizarCliente({
      id: "cliente-1",
      nombre: "Claudia Editada",
      telefono: "9 1234 5678",
      lugarTrabajo: "Finanzas"
    });

    expect(result.bloqueado).toBe(true);
    expect(result.motivoBloqueo).toBe("Pedidos repetidos sin retiro");
  });
});

describe("AdminCustomerService - bloquearCliente (Fase 7.5A, seccion 4)", () => {
  it("bloquea con un motivo valido y registra la fecha", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository);
    const service = new AdminCustomerService(repository);

    const before = Date.now();
    const result = await service.bloquearCliente({
      id: "cliente-1",
      motivo: "Pedidos repetidos sin retiro ni aviso",
      bloqueadoPor: "admin-uuid-1"
    });

    expect(result.bloqueado).toBe(true);
    expect(result.motivoBloqueo).toBe("Pedidos repetidos sin retiro ni aviso");
    expect(result.bloqueadoEn).toBeDefined();
    expect(new Date(result.bloqueadoEn as string).getTime()).toBeGreaterThanOrEqual(before);
    expect(result.desbloqueadoEn).toBeUndefined();
  });

  it("rechaza bloquear un cliente inexistente", async () => {
    const repository = new ClienteRepositoryStub();
    const service = new AdminCustomerService(repository);

    await expect(
      service.bloquearCliente({ id: "no-existe", motivo: "Motivo valido aqui", bloqueadoPor: null })
    ).rejects.toThrow(/no encontrado/i);
  });

  it("rechaza motivo vacio", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository);
    const service = new AdminCustomerService(repository);

    await expect(
      service.bloquearCliente({ id: "cliente-1", motivo: "", bloqueadoPor: null })
    ).rejects.toThrow(/motivo/i);
  });

  it("rechaza motivo de solo espacios", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository);
    const service = new AdminCustomerService(repository);

    await expect(
      service.bloquearCliente({ id: "cliente-1", motivo: "      ", bloqueadoPor: null })
    ).rejects.toThrow(/motivo/i);
  });

  it("rechaza motivo demasiado corto (menos de 5 caracteres)", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository);
    const service = new AdminCustomerService(repository);

    await expect(
      service.bloquearCliente({ id: "cliente-1", motivo: "abc", bloqueadoPor: null })
    ).rejects.toThrow(/al menos 5/);
  });

  it("rechaza motivo demasiado largo (mas de 500 caracteres)", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository);
    const service = new AdminCustomerService(repository);

    await expect(
      service.bloquearCliente({ id: "cliente-1", motivo: "a".repeat(501), bloqueadoPor: null })
    ).rejects.toThrow(/500/);
  });

  it("rechaza un motivo que no sea string", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository);
    const service = new AdminCustomerService(repository);

    await expect(
      service.bloquearCliente({ id: "cliente-1", motivo: 12345, bloqueadoPor: null })
    ).rejects.toThrow(/motivo/i);
    await expect(
      service.bloquearCliente({ id: "cliente-1", motivo: null, bloqueadoPor: null })
    ).rejects.toThrow(/motivo/i);
    await expect(
      service.bloquearCliente({ id: "cliente-1", motivo: undefined, bloqueadoPor: null })
    ).rejects.toThrow(/motivo/i);
  });

  it("es idempotente: bloquear a alguien ya bloqueado actualiza el motivo explicito sin duplicar nada", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository, { bloqueado: true, motivoBloqueo: "Motivo original valido" });
    const service = new AdminCustomerService(repository);

    const result = await service.bloquearCliente({
      id: "cliente-1",
      motivo: "Motivo actualizado explicitamente",
      bloqueadoPor: "admin-uuid-2"
    });

    expect(result.bloqueado).toBe(true);
    expect(result.motivoBloqueo).toBe("Motivo actualizado explicitamente");
  });

  it("no modifica nombre, telefono ni lugarTrabajo al bloquear", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository, { nombre: "Claudia Perez", telefono: "+56911112222" });
    const service = new AdminCustomerService(repository);

    const result = await service.bloquearCliente({
      id: "cliente-1",
      motivo: "Motivo administrativo valido",
      bloqueadoPor: null
    });

    expect(result.nombre).toBe("Claudia Perez");
    expect(result.telefono).toBe("+56911112222");
  });
});

describe("AdminCustomerService - desbloquearCliente (Fase 7.5A, seccion 5)", () => {
  it("desbloquea y limpia el estado, conservando motivo y fecha de bloqueo como referencia", async () => {
    const bloqueadoEn = new Date("2026-08-01T00:00:00.000Z");
    const repository = new ClienteRepositoryStub();
    seedCliente(repository, { bloqueado: true, motivoBloqueo: "Motivo previo valido", bloqueadoEn });
    const service = new AdminCustomerService(repository);

    const result = await service.desbloquearCliente("cliente-1");

    expect(result.bloqueado).toBe(false);
    expect(result.motivoBloqueo).toBe("Motivo previo valido");
    expect(result.bloqueadoEn).toBe(bloqueadoEn.toISOString());
    expect(result.desbloqueadoEn).toBeDefined();
  });

  it("rechaza desbloquear un cliente inexistente", async () => {
    const repository = new ClienteRepositoryStub();
    const service = new AdminCustomerService(repository);

    await expect(service.desbloquearCliente("no-existe")).rejects.toThrow(/no encontrado/i);
  });

  it("es idempotente sobre un cliente que ya estaba desbloqueado", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository, { bloqueado: false });
    const service = new AdminCustomerService(repository);

    const result = await service.desbloquearCliente("cliente-1");
    expect(result.bloqueado).toBe(false);
  });

  it("no modifica nombre, telefono ni lugarTrabajo al desbloquear", async () => {
    const repository = new ClienteRepositoryStub();
    seedCliente(repository, {
      nombre: "Claudia Perez",
      telefono: "+56911112222",
      bloqueado: true,
      motivoBloqueo: "Motivo previo valido"
    });
    const service = new AdminCustomerService(repository);

    const result = await service.desbloquearCliente("cliente-1");

    expect(result.nombre).toBe("Claudia Perez");
    expect(result.telefono).toBe("+56911112222");
  });
});
