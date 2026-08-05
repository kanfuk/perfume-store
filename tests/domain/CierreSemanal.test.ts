import { describe, expect, it } from "vitest";
import {
  CierreSemanal,
  type CierreSemanalProps,
  ESTADO_CIERRE_SEMANAL_CLOSED,
  ESTADO_CIERRE_SEMANAL_REOPENED,
  isEstadoCierreSemanal,
  validarMotivoReapertura
} from "@/domain/CierreSemanal";

/**
 * Fase 7.6A: CierreSemanal es una entidad INMUTABLE (fotografia historica ya
 * calculada) -- a diferencia de Cliente/Producto, no expone mutadores;
 * reabrir/cerrar se modela creando una fila nueva en el repositorio, nunca
 * mutando esta instancia. Estas pruebas cubren solo el contrato de
 * validacion del constructor y validarMotivoReapertura.
 */

function baseProps(overrides: Partial<CierreSemanalProps> = {}): CierreSemanalProps {
  return {
    id: "cierre-1",
    periodStart: new Date("2026-08-03T04:00:00.000Z"),
    periodEndExclusive: new Date("2026-08-10T04:00:00.000Z"),
    version: 1,
    status: ESTADO_CIERRE_SEMANAL_CLOSED,
    ordersCount: 5,
    cancelledOrdersCount: 1,
    pendingOrdersCount: 2,
    deliveredOrdersCount: 2,
    directSalesCount: 1,
    grossSales: 100000,
    incomeAmount: 80000,
    costAmount: 40000,
    profitAmount: 60000,
    outstandingAmount: 20000,
    snapshot: {},
    closedAt: new Date("2026-08-10T04:05:00.000Z"),
    closedByEmail: "admin@smellme.cl",
    closedByNombre: "Admin",
    reopenedAt: null,
    reopenedByEmail: null,
    reopenedByNombre: null,
    reopenReason: null,
    createdAt: new Date("2026-08-10T04:05:00.000Z"),
    updatedAt: new Date("2026-08-10T04:05:00.000Z"),
    ...overrides
  };
}

describe("CierreSemanal - validaciones de construccion", () => {
  it("construye una instancia valida y expone los getters estaCerrado/estaReabierto", () => {
    const cierre = new CierreSemanal(baseProps());
    expect(cierre.estaCerrado).toBe(true);
    expect(cierre.estaReabierto).toBe(false);
    expect(cierre.version).toBe(1);
  });

  it("estaReabierto es true cuando status es REOPENED (con motivo)", () => {
    const cierre = new CierreSemanal(
      baseProps({
        status: ESTADO_CIERRE_SEMANAL_REOPENED,
        reopenedAt: new Date("2026-08-11T00:00:00.000Z"),
        reopenedByEmail: "admin@smellme.cl",
        reopenReason: "Se detecto un pago registrado despues del cierre."
      })
    );
    expect(cierre.estaReabierto).toBe(true);
    expect(cierre.estaCerrado).toBe(false);
  });

  it("rechaza periodStart >= periodEndExclusive", () => {
    expect(
      () =>
        new CierreSemanal(
          baseProps({ periodStart: new Date("2026-08-10T04:00:00.000Z"), periodEndExclusive: new Date("2026-08-10T04:00:00.000Z") })
        )
    ).toThrow(/periodo del cierre no es valido/i);
  });

  it("rechaza fechas invalidas (Invalid Date), nunca las almacena silenciosamente", () => {
    expect(() => new CierreSemanal(baseProps({ periodStart: new Date("no-es-fecha") }))).toThrow(/no es una fecha valida/i);
    expect(() => new CierreSemanal(baseProps({ closedAt: new Date("no-es-fecha") }))).toThrow(/no es una fecha valida/i);
    expect(() => new CierreSemanal(baseProps({ reopenedAt: new Date("no-es-fecha") }))).toThrow(/no es una fecha valida/i);
  });

  it("rechaza version cero o negativa, y version no entera", () => {
    expect(() => new CierreSemanal(baseProps({ version: 0 }))).toThrow(/version del cierre debe ser un entero positivo/i);
    expect(() => new CierreSemanal(baseProps({ version: -1 }))).toThrow(/version del cierre debe ser un entero positivo/i);
    expect(() => new CierreSemanal(baseProps({ version: 1.5 }))).toThrow(/version del cierre debe ser un entero positivo/i);
  });

  it("rechaza un estado fuera del conjunto controlado CLOSED/REOPENED", () => {
    expect(() => new CierreSemanal(baseProps({ status: "ARCHIVED" as never }))).toThrow(/estado del cierre no es valido/i);
  });

  it("isEstadoCierreSemanal solo acepta CLOSED/REOPENED", () => {
    expect(isEstadoCierreSemanal("CLOSED")).toBe(true);
    expect(isEstadoCierreSemanal("REOPENED")).toBe(true);
    expect(isEstadoCierreSemanal("ARCHIVED")).toBe(false);
  });

  it("rechaza conteos negativos o no enteros", () => {
    expect(() => new CierreSemanal(baseProps({ ordersCount: -1 }))).toThrow(/conteo de pedidos/i);
    expect(() => new CierreSemanal(baseProps({ ordersCount: 1.2 }))).toThrow(/conteo de pedidos/i);
    expect(() => new CierreSemanal(baseProps({ cancelledOrdersCount: -1 }))).toThrow(/conteo de cancelados/i);
    expect(() => new CierreSemanal(baseProps({ pendingOrdersCount: -1 }))).toThrow(/conteo de pendientes/i);
    expect(() => new CierreSemanal(baseProps({ deliveredOrdersCount: -1 }))).toThrow(/conteo de entregados/i);
    expect(() => new CierreSemanal(baseProps({ directSalesCount: -1 }))).toThrow(/conteo de ventas directas/i);
  });

  it("rechaza montos negativos o no finitos, salvo profitAmount", () => {
    expect(() => new CierreSemanal(baseProps({ grossSales: -1 }))).toThrow(/monto de ventas/i);
    expect(() => new CierreSemanal(baseProps({ incomeAmount: Number.POSITIVE_INFINITY }))).toThrow(/monto de ingresos/i);
    expect(() => new CierreSemanal(baseProps({ costAmount: -1 }))).toThrow(/monto de costos/i);
    expect(() => new CierreSemanal(baseProps({ outstandingAmount: -1 }))).toThrow(/saldo pendiente/i);
  });

  it("permite profitAmount negativo (una semana puede cerrar con perdida real)", () => {
    const cierre = new CierreSemanal(baseProps({ profitAmount: -5000 }));
    expect(cierre.profitAmount).toBe(-5000);
  });

  it("rechaza profitAmount no finito (NaN/Infinity)", () => {
    expect(() => new CierreSemanal(baseProps({ profitAmount: Number.NaN }))).toThrow(/monto de utilidad debe ser un numero finito/i);
    expect(() => new CierreSemanal(baseProps({ profitAmount: Number.POSITIVE_INFINITY }))).toThrow(
      /monto de utilidad debe ser un numero finito/i
    );
  });

  it("un cierre REOPENED sin reopenReason es rechazado (nunca queda huerfano de motivo)", () => {
    expect(
      () => new CierreSemanal(baseProps({ status: ESTADO_CIERRE_SEMANAL_REOPENED, reopenReason: null }))
    ).toThrow(/debe conservar el motivo de reapertura/i);

    expect(
      () => new CierreSemanal(baseProps({ status: ESTADO_CIERRE_SEMANAL_REOPENED, reopenReason: "   " }))
    ).toThrow(/debe conservar el motivo de reapertura/i);
  });
});

describe("validarMotivoReapertura", () => {
  it("acepta un motivo valido (5 a 500 caracteres) y retorna la version trimmed", () => {
    expect(validarMotivoReapertura("  Motivo administrativo valido  ")).toBe("Motivo administrativo valido");
  });

  it("rechaza valores no string", () => {
    expect(() => validarMotivoReapertura(undefined)).toThrow(/motivo de reapertura es obligatorio/i);
    expect(() => validarMotivoReapertura(123)).toThrow(/motivo de reapertura es obligatorio/i);
    expect(() => validarMotivoReapertura(null)).toThrow(/motivo de reapertura es obligatorio/i);
  });

  it("rechaza un motivo vacio o solo espacios", () => {
    expect(() => validarMotivoReapertura("")).toThrow(/motivo de reapertura es obligatorio/i);
    expect(() => validarMotivoReapertura("    ")).toThrow(/motivo de reapertura es obligatorio/i);
  });

  it("rechaza un motivo con menos de 5 caracteres (trim)", () => {
    expect(() => validarMotivoReapertura("ab")).toThrow(/al menos 5 caracteres/i);
    expect(() => validarMotivoReapertura("  ab  ")).toThrow(/al menos 5 caracteres/i);
  });

  it("rechaza un motivo con mas de 500 caracteres", () => {
    expect(() => validarMotivoReapertura("a".repeat(501))).toThrow(/no puede superar los 500 caracteres/i);
  });

  it("acepta exactamente 5 y exactamente 500 caracteres (limites inclusivos)", () => {
    expect(validarMotivoReapertura("abcde")).toBe("abcde");
    expect(validarMotivoReapertura("a".repeat(500))).toBe("a".repeat(500));
  });
});
