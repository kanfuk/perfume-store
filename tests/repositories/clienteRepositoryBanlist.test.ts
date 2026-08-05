import { beforeEach, describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { localStore } from "@/lib/local-store";
import { getClienteRepository } from "@/repositories/clienteRepository";

/**
 * Fase 7.5A: cubre, contra el repositorio en memoria (sin Supabase, mismo
 * patron que tests/repositories/pedidoRepositoryTransaccional.test.ts), los
 * metodos nuevos de la banlist: lectura por id, escritura parcial del
 * estado de bloqueo, y la busqueda de coincidencia exacta por
 * telefono/RUT/correo entre clientes bloqueados.
 */

function resetLocalStore() {
  localStore.customers.length = 0;
}

beforeEach(() => {
  resetLocalStore();
});

describe("ClienteRepository (memoria) - buscarClientePorId / actualizarEstadoBloqueo", () => {
  it("buscarClientePorId retorna null si no existe", async () => {
    const repository = getClienteRepository();
    expect(await repository.buscarClientePorId("no-existe")).toBeNull();
  });

  it("actualizarEstadoBloqueo escribe SOLO las columnas de bloqueo, sin tocar datos personales", async () => {
    const repository = getClienteRepository();
    const { id } = await repository.upsertCliente(
      new Cliente({ nombre: "Rodrigo", telefono: "+56911112222", lugarTrabajo: "Bodega" })
    );

    const actualizado = await repository.actualizarEstadoBloqueo(id, {
      bloqueado: true,
      motivoBloqueo: "Pedidos repetidos sin retiro",
      bloqueadoEn: new Date("2026-08-01T00:00:00.000Z"),
      desbloqueadoEn: null,
      bloqueadoPor: "admin-uuid-1"
    });

    expect(actualizado.bloqueado).toBe(true);
    expect(actualizado.motivoBloqueo).toBe("Pedidos repetidos sin retiro");
    expect(actualizado.nombre).toBe("Rodrigo");
    expect(actualizado.telefono).toBe("+56911112222");
    expect(actualizado.lugarTrabajo).toBe("Bodega");

    const releido = await repository.buscarClientePorId(id);
    expect(releido?.bloqueado).toBe(true);
    expect(releido?.nombre).toBe("Rodrigo");
  });

  it("actualizarEstadoBloqueo rechaza un cliente inexistente", async () => {
    const repository = getClienteRepository();
    await expect(
      repository.actualizarEstadoBloqueo("no-existe", {
        bloqueado: true,
        motivoBloqueo: "Motivo",
        bloqueadoEn: new Date(),
        desbloqueadoEn: null,
        bloqueadoPor: null
      })
    ).rejects.toThrow(/no encontrado/i);
  });
});

describe("ClienteRepository (memoria) - buscarClienteBloqueadoPorIdentidad (coincidencia exacta, nunca fuzzy)", () => {
  it("coincide por telefono exacto entre clientes bloqueados", async () => {
    const repository = getClienteRepository();
    const { id } = await repository.upsertCliente(
      new Cliente({ nombre: "Bloqueado", telefono: "+56911112222" })
    );
    await repository.actualizarEstadoBloqueo(id, {
      bloqueado: true,
      motivoBloqueo: "Motivo valido",
      bloqueadoEn: new Date(),
      desbloqueadoEn: null,
      bloqueadoPor: null
    });

    const result = await repository.buscarClienteBloqueadoPorIdentidad({ telefono: "+56911112222" });
    expect(result?.id).toBe(id);
  });

  it("coincide por RUT exacto cuando el telefono no coincide", async () => {
    const repository = getClienteRepository();
    const { id } = await repository.upsertCliente(
      new Cliente({ nombre: "Bloqueado", telefono: "+56900000000", rut: "11111111-1" })
    );
    await repository.actualizarEstadoBloqueo(id, {
      bloqueado: true,
      motivoBloqueo: "Motivo valido",
      bloqueadoEn: new Date(),
      desbloqueadoEn: null,
      bloqueadoPor: null
    });

    const result = await repository.buscarClienteBloqueadoPorIdentidad({
      telefono: "+56999999999",
      rut: "11111111-1"
    });
    expect(result?.id).toBe(id);
  });

  it("coincide por correo exacto cuando telefono y RUT no coinciden", async () => {
    const repository = getClienteRepository();
    const { id } = await repository.upsertCliente(
      new Cliente({ nombre: "Bloqueado", telefono: "+56900000000", email: "bloqueado@example.com" })
    );
    await repository.actualizarEstadoBloqueo(id, {
      bloqueado: true,
      motivoBloqueo: "Motivo valido",
      bloqueadoEn: new Date(),
      desbloqueadoEn: null,
      bloqueadoPor: null
    });

    const result = await repository.buscarClienteBloqueadoPorIdentidad({
      telefono: "+56999999999",
      rut: "22222222-2",
      email: "bloqueado@example.com"
    });
    expect(result?.id).toBe(id);
  });

  it("no coincide con un cliente que NO esta bloqueado, aunque el telefono sea identico", async () => {
    const repository = getClienteRepository();
    await repository.upsertCliente(new Cliente({ nombre: "Habilitado", telefono: "+56911112222" }));

    const result = await repository.buscarClienteBloqueadoPorIdentidad({ telefono: "+56911112222" });
    expect(result).toBeNull();
  });

  it("nunca hace coincidencia parcial (substring) -- solo igualdad exacta", async () => {
    const repository = getClienteRepository();
    const { id } = await repository.upsertCliente(
      new Cliente({ nombre: "Bloqueado", telefono: "+56911112222" })
    );
    await repository.actualizarEstadoBloqueo(id, {
      bloqueado: true,
      motivoBloqueo: "Motivo valido",
      bloqueadoEn: new Date(),
      desbloqueadoEn: null,
      bloqueadoPor: null
    });

    // "+5691111222" (le falta el ultimo digito) no debe coincidir aunque
    // sea un prefijo del numero bloqueado.
    const result = await repository.buscarClienteBloqueadoPorIdentidad({ telefono: "+5691111222" });
    expect(result).toBeNull();
  });

  it("sin ningun identificador entregado, retorna null (nunca bloquea por el nombre)", async () => {
    const repository = getClienteRepository();
    const result = await repository.buscarClienteBloqueadoPorIdentidad({});
    expect(result).toBeNull();
  });
});
