import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";

describe("Cliente - banlist (Fase 7.5A): bloquear/desbloquear", () => {
  it("un cliente nuevo nunca esta bloqueado por defecto", () => {
    const cliente = new Cliente({ nombre: "Rodrigo" });
    expect(cliente.bloqueado).toBe(false);
    expect(cliente.motivoBloqueo).toBeNull();
    expect(cliente.bloqueadoEn).toBeNull();
    expect(cliente.desbloqueadoEn).toBeNull();
    expect(cliente.bloqueadoPor).toBeNull();
  });

  it("bloquear() marca bloqueado, guarda motivo/admin y limpia desbloqueadoEn", () => {
    const cliente = new Cliente({ nombre: "Rodrigo" });
    const before = Date.now();

    cliente.bloquear("Pedidos repetidos sin retiro", "admin-uuid-1");

    expect(cliente.bloqueado).toBe(true);
    expect(cliente.motivoBloqueo).toBe("Pedidos repetidos sin retiro");
    expect(cliente.bloqueadoPor).toBe("admin-uuid-1");
    expect(cliente.bloqueadoEn).not.toBeNull();
    expect((cliente.bloqueadoEn as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(cliente.desbloqueadoEn).toBeNull();
  });

  it("desbloquear() quita el bloqueo pero conserva motivoBloqueo y bloqueadoEn como referencia", () => {
    const cliente = new Cliente({ nombre: "Rodrigo" });
    cliente.bloquear("Motivo original", "admin-uuid-1");
    const bloqueadoEn = cliente.bloqueadoEn;

    cliente.desbloquear();

    expect(cliente.bloqueado).toBe(false);
    expect(cliente.motivoBloqueo).toBe("Motivo original");
    expect(cliente.bloqueadoEn).toBe(bloqueadoEn);
    expect(cliente.desbloqueadoEn).not.toBeNull();
  });

  it("bloquear() es idempotente: volver a bloquear actualiza motivo/admin/fecha sin duplicar estado", () => {
    const cliente = new Cliente({ nombre: "Rodrigo" });
    cliente.bloquear("Motivo 1", "admin-uuid-1");
    cliente.bloquear("Motivo 2", "admin-uuid-2");

    expect(cliente.bloqueado).toBe(true);
    expect(cliente.motivoBloqueo).toBe("Motivo 2");
    expect(cliente.bloqueadoPor).toBe("admin-uuid-2");
  });

  it("desbloquear() es idempotente sobre un cliente que ya estaba desbloqueado", () => {
    const cliente = new Cliente({ nombre: "Rodrigo" });
    cliente.desbloquear();
    expect(cliente.bloqueado).toBe(false);
    cliente.desbloquear();
    expect(cliente.bloqueado).toBe(false);
  });

  it("bloquear/desbloquear nunca modifican nombre, telefono, rut, email ni direccion", () => {
    const cliente = new Cliente({
      nombre: "Rodrigo",
      telefono: "+56911112222",
      rut: "11111111-1",
      email: "rodrigo@example.com",
      direccion: "Calle Falsa 123"
    });

    cliente.bloquear("Motivo valido", "admin-uuid-1");
    expect(cliente.nombre).toBe("Rodrigo");
    expect(cliente.telefono).toBe("+56911112222");
    expect(cliente.rut).toBe("11111111-1");
    expect(cliente.email).toBe("rodrigo@example.com");
    expect(cliente.direccion).toBe("Calle Falsa 123");

    cliente.desbloquear();
    expect(cliente.nombre).toBe("Rodrigo");
    expect(cliente.telefono).toBe("+56911112222");
  });

  it("acepta bloqueadoPor null (bloqueo sin identidad de admin resuelta)", () => {
    const cliente = new Cliente({ nombre: "Rodrigo" });
    cliente.bloquear("Motivo valido", null);
    expect(cliente.bloqueadoPor).toBeNull();
  });

  it("el constructor acepta y conserva un estado de bloqueo preexistente (round-trip desde el repositorio)", () => {
    const bloqueadoEn = new Date("2026-08-01T00:00:00.000Z");
    const cliente = new Cliente({
      nombre: "Rodrigo",
      bloqueado: true,
      motivoBloqueo: "Motivo previo",
      bloqueadoEn,
      desbloqueadoEn: null,
      bloqueadoPor: "admin-uuid-1"
    });

    expect(cliente.bloqueado).toBe(true);
    expect(cliente.motivoBloqueo).toBe("Motivo previo");
    expect(cliente.bloqueadoEn).toBe(bloqueadoEn);
    expect(cliente.bloqueadoPor).toBe("admin-uuid-1");
  });
});
