import { beforeEach, describe, expect, it } from "vitest";
import { localStore } from "@/lib/local-store";
import { getCierreSemanalRepository } from "@/repositories/cierreSemanalRepository";

/**
 * Fase 7.6A: cubre el repositorio en memoria (sin Supabase, mismo patron que
 * tests/repositories/clienteRepositoryBanlist.test.ts) -- versionado,
 * prevencion de duplicados activos, reapertura y listado ordenado.
 */

const PERIOD_START = new Date("2026-08-03T04:00:00.000Z");
const PERIOD_END_EXCLUSIVE = new Date("2026-08-10T04:00:00.000Z");

function baseMetrics() {
  return {
    ordersCount: 5,
    cancelledOrdersCount: 1,
    pendingOrdersCount: 2,
    deliveredOrdersCount: 2,
    directSalesCount: 1,
    grossSales: 100000,
    incomeAmount: 80000,
    costAmount: 40000,
    profitAmount: 60000,
    outstandingAmount: 20000
  };
}

beforeEach(() => {
  localStore.weeklyClosures.length = 0;
});

describe("CierreSemanalRepository (memoria) - crearCierre", () => {
  it("crea un cierre CLOSED en version 1 para un periodo nuevo", async () => {
    const repository = getCierreSemanalRepository();
    const cierre = await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: { detalle: true },
      admin: { email: "admin@smellme.cl", nombre: "Admin" }
    });

    expect(cierre.version).toBe(1);
    expect(cierre.status).toBe("CLOSED");
    expect(cierre.closedByEmail).toBe("admin@smellme.cl");
  });

  it("rechaza un segundo cierre CLOSED activo para el mismo periodo (WC001)", async () => {
    const repository = getCierreSemanalRepository();
    await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    await expect(
      repository.crearCierre({
        periodStart: PERIOD_START,
        periodEndExclusive: PERIOD_END_EXCLUSIVE,
        metrics: baseMetrics(),
        snapshot: {},
        admin: {}
      })
    ).rejects.toMatchObject({ code: "WC001" });
  });

  it("permite un nuevo cierre (version 2) del mismo periodo despues de reabrir el anterior", async () => {
    const repository = getCierreSemanalRepository();
    const first = await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    await repository.reabrirCierre({ closureId: first.id, reason: "Correccion de un pago", admin: {} });

    const second = await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    expect(second.version).toBe(2);
    expect(second.status).toBe("CLOSED");

    // La version 1 permanece intacta y reabierta, nunca se borra ni se pisa.
    const stillThere = await repository.obtenerCierrePorId(first.id);
    expect(stillThere?.status).toBe("REOPENED");
    expect(stillThere?.version).toBe(1);
  });

  it("un periodo distinto no colisiona con el indice unico del primero", async () => {
    const repository = getCierreSemanalRepository();
    await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    const otroPeriodo = await repository.crearCierre({
      periodStart: new Date("2026-08-10T04:00:00.000Z"),
      periodEndExclusive: new Date("2026-08-17T04:00:00.000Z"),
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    expect(otroPeriodo.version).toBe(1);
    expect(otroPeriodo.status).toBe("CLOSED");
  });
});

describe("CierreSemanalRepository (memoria) - reabrirCierre", () => {
  it("reabre un cierre CLOSED, guarda el motivo y la identidad del admin", async () => {
    const repository = getCierreSemanalRepository();
    const cierre = await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    const reabierto = await repository.reabrirCierre({
      closureId: cierre.id,
      reason: "Se detecto un pago registrado despues del cierre.",
      admin: { email: "admin@smellme.cl", nombre: "Admin" }
    });

    expect(reabierto.status).toBe("REOPENED");
    expect(reabierto.reopenReason).toBe("Se detecto un pago registrado despues del cierre.");
    expect(reabierto.reopenedByEmail).toBe("admin@smellme.cl");
    expect(reabierto.reopenedAt).toBeInstanceOf(Date);
  });

  it("rechaza reabrir un cierre inexistente (WC002)", async () => {
    const repository = getCierreSemanalRepository();
    await expect(
      repository.reabrirCierre({ closureId: "no-existe", reason: "Motivo valido", admin: {} })
    ).rejects.toMatchObject({ code: "WC002" });
  });

  it("rechaza reabrir un cierre ya reabierto -- conflicto explicito, no idempotente (WC003)", async () => {
    const repository = getCierreSemanalRepository();
    const cierre = await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    await repository.reabrirCierre({ closureId: cierre.id, reason: "Primer motivo valido", admin: {} });

    await expect(
      repository.reabrirCierre({ closureId: cierre.id, reason: "Segundo motivo valido", admin: {} })
    ).rejects.toMatchObject({ code: "WC003" });
  });
});

describe("CierreSemanalRepository (memoria) - listarCierres / obtenerCierreActivoPorPeriodo", () => {
  it("obtenerCierreActivoPorPeriodo retorna null si no hay ningun CLOSED para ese periodo", async () => {
    const repository = getCierreSemanalRepository();
    expect(await repository.obtenerCierreActivoPorPeriodo(PERIOD_START, PERIOD_END_EXCLUSIVE)).toBeNull();
  });

  it("obtenerCierreActivoPorPeriodo ignora versiones REOPENED", async () => {
    const repository = getCierreSemanalRepository();
    const cierre = await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });
    await repository.reabrirCierre({ closureId: cierre.id, reason: "Motivo valido de reapertura", admin: {} });

    expect(await repository.obtenerCierreActivoPorPeriodo(PERIOD_START, PERIOD_END_EXCLUSIVE)).toBeNull();
  });

  it("listarCierres ordena por periodo mas reciente primero, version mas reciente primero", async () => {
    const repository = getCierreSemanalRepository();
    const semana1 = await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });
    await repository.reabrirCierre({ closureId: semana1.id, reason: "Motivo valido de reapertura", admin: {} });
    await repository.crearCierre({
      periodStart: PERIOD_START,
      periodEndExclusive: PERIOD_END_EXCLUSIVE,
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });
    await repository.crearCierre({
      periodStart: new Date("2026-08-10T04:00:00.000Z"),
      periodEndExclusive: new Date("2026-08-17T04:00:00.000Z"),
      metrics: baseMetrics(),
      snapshot: {},
      admin: {}
    });

    const { items, total } = await repository.listarCierres({ limit: 10, offset: 0 });
    expect(total).toBe(3);
    expect(items[0].periodStart.getTime()).toBe(new Date("2026-08-10T04:00:00.000Z").getTime());
    expect(items[1].version).toBe(2);
    expect(items[2].version).toBe(1);
  });

  it("listarCierres respeta limit/offset", async () => {
    const repository = getCierreSemanalRepository();
    for (let i = 0; i < 3; i += 1) {
      await repository.crearCierre({
        periodStart: new Date(PERIOD_START.getTime() + i * 7 * 24 * 60 * 60 * 1000),
        periodEndExclusive: new Date(PERIOD_END_EXCLUSIVE.getTime() + i * 7 * 24 * 60 * 60 * 1000),
        metrics: baseMetrics(),
        snapshot: {},
        admin: {}
      });
    }

    const page = await repository.listarCierres({ limit: 1, offset: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
  });
});
