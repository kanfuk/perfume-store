import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CierreSemanal } from "@/domain/CierreSemanal";
import type {
  AdminIdentidad,
  CierreSemanalRepository,
  CrearCierreSemanalInput,
  ReabrirCierreSemanalInput
} from "@/repositories/cierreSemanalRepository";

/**
 * Fase 7.6A: el servicio calcula el snapshot reutilizando integramente
 * PedidoService.obtenerDashboardAdmin + resolveOrderItemProfitabilityCost
 * (via ProductoService.obtenerCatalogoAdmin) y las consultas de
 * pagos/fiados del repositorio de pedidos -- se mockean esas tres fuentes
 * para controlar exactamente que datos "reales" ve el servicio, sin
 * reimplementar ninguna formula de negocio en la prueba.
 */

const PERIOD_START_ISO = "2026-08-03T04:00:00.000Z"; // lunes 00:00 Chile (invierno, UTC-4)

function order(overrides: Record<string, unknown>) {
  return {
    id: "pedido-generico",
    codigo: "PS-0000",
    clienteId: "cliente-1",
    clienteNombre: "Cliente",
    clienteTelefono: "+56911112222",
    clienteLugarTrabajo: "",
    productoId: "producto-1",
    productoNombre: "Perfume",
    cantidad: 1,
    precioUnitario: 10000,
    subtotal: 10000,
    items: [],
    estadoPedido: "ENTREGADO",
    estadoPago: "PAGADO",
    total: 10000,
    totalCost: 0,
    grossProfit: 0,
    fechaPedido: PERIOD_START_ISO,
    totalPagado: 10000,
    saldoPendiente: 0,
    pagosRegistrados: 1,
    origenPedido: "PUBLICO",
    ...overrides
  };
}

const dashboardMock = vi.fn();
const catalogoMock = vi.fn(async () => [] as unknown[]);
const pagosMock = vi.fn(async () => [] as unknown[]);
const fiadosMock = vi.fn(async () => [] as unknown[]);

vi.mock("@/services/pedidoService", () => ({
  createPedidoService: () => ({ obtenerDashboardAdmin: dashboardMock })
}));

vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({ obtenerCatalogoAdmin: catalogoMock })
}));

vi.mock("@/repositories/pedidoRepository", () => ({
  getPedidoRepository: () => ({
    buscarPagosPorPedidoIds: pagosMock,
    buscarFiadosPorPedidoIds: fiadosMock
  })
}));

class CierreSemanalRepositoryStub implements CierreSemanalRepository {
  public created: CrearCierreSemanalInput[] = [];
  public reopened: ReabrirCierreSemanalInput[] = [];
  private readonly closures = new Map<string, CierreSemanal>();
  public activeByPeriod: CierreSemanal | null = null;

  async listarCierres() {
    return { items: [...this.closures.values()], total: this.closures.size };
  }

  async obtenerCierrePorId(id: string) {
    return this.closures.get(id) ?? null;
  }

  async obtenerCierreActivoPorPeriodo() {
    return this.activeByPeriod;
  }

  async crearCierre(input: CrearCierreSemanalInput) {
    this.created.push(input);
    const cierre = {
      id: "cierre-nuevo",
      periodStart: input.periodStart,
      periodEndExclusive: input.periodEndExclusive,
      version: 1,
      status: "CLOSED",
      ...input.metrics,
      snapshot: input.snapshot,
      closedAt: new Date(),
      closedByEmail: input.admin.email ?? null,
      closedByNombre: input.admin.nombre ?? null,
      reopenedAt: null,
      reopenedByEmail: null,
      reopenedByNombre: null,
      reopenReason: null
    } as unknown as CierreSemanal;
    this.closures.set(cierre.id, cierre);
    return cierre;
  }

  async reabrirCierre(input: ReabrirCierreSemanalInput) {
    this.reopened.push(input);
    const existing = this.closures.get(input.closureId);
    if (!existing) {
      throw new Error("Cierre no encontrado.");
    }
    const reopened = {
      ...existing,
      status: "REOPENED",
      reopenedAt: new Date(),
      reopenedByEmail: input.admin.email ?? null,
      reopenedByNombre: input.admin.nombre ?? null,
      reopenReason: input.reason
    } as CierreSemanal;
    this.closures.set(existing.id, reopened);
    return reopened;
  }
}

beforeEach(() => {
  dashboardMock.mockReset();
  catalogoMock.mockReset().mockResolvedValue([]);
  pagosMock.mockReset().mockResolvedValue([]);
  fiadosMock.mockReset().mockResolvedValue([]);
});

async function importService() {
  return import("@/services/cierreSemanalService");
}

describe("CierreSemanalService - validacion de periodo", () => {
  it("rechaza una fecha que no sea lunes (WC005)", async () => {
    const { CierreSemanalService } = await importService();
    const service = new CierreSemanalService(new CierreSemanalRepositoryStub());
    await expect(service.previsualizarCierre("2026-08-04")).rejects.toMatchObject({ code: "WC005" });
  });

  it("rechaza un formato de fecha invalido", async () => {
    const { CierreSemanalService } = await importService();
    const service = new CierreSemanalService(new CierreSemanalRepositoryStub());
    await expect(service.previsualizarCierre("no-es-fecha")).rejects.toMatchObject({ code: "WC005" });
  });
});

describe("CierreSemanalService - previsualizarCierre / calculo del snapshot", () => {
  it("ventas suma subtotal de items de finalizados en el periodo; ingresos suma pagos con fecha_pago en el periodo", async () => {
    dashboardMock.mockResolvedValue({
      pendientes: [],
      agendados: [],
      finalizados: [
        order({
          id: "pedido-en-periodo",
          fechaPedido: "2026-08-04T12:00:00.000Z",
          fechaEntrega: "2026-08-04T12:00:00.000Z",
          estadoPedido: "ENTREGADO",
          origenPedido: "ADMIN_DIRECTO",
          subtotal: 15000,
          total: 15000,
          items: [
            {
              productoId: "producto-1",
              productoNombre: "Perfume A",
              cantidad: 1,
              precioUnitario: 15000,
              costoUnitario: 6000,
              costoTotal: 6000,
              utilidadBruta: 9000,
              subtotal: 15000
            }
          ]
        }),
        order({
          id: "pedido-fuera-periodo",
          fechaPedido: "2026-07-20T12:00:00.000Z",
          fechaEntrega: "2026-07-20T12:00:00.000Z",
          subtotal: 99999,
          items: [
            {
              productoId: "producto-2",
              productoNombre: "Perfume B",
              cantidad: 1,
              precioUnitario: 99999,
              costoUnitario: 0,
              costoTotal: 0,
              utilidadBruta: 0,
              subtotal: 99999
            }
          ]
        })
      ],
      cancelados: [],
      fiadosPendientes: [],
      pedidosNuevos: 0
    });

    pagosMock.mockResolvedValue([
      { id: "pago-1", pedidoId: "pedido-en-periodo", monto: 15000, estadoPago: "PAGADO", fechaPago: "2026-08-04T12:00:00.000Z" },
      { id: "pago-2", pedidoId: "pedido-fuera-periodo", monto: 99999, estadoPago: "PAGADO", fechaPago: "2026-07-20T12:00:00.000Z" }
    ]);

    const { CierreSemanalService } = await importService();
    const service = new CierreSemanalService(new CierreSemanalRepositoryStub());
    const preview = await service.previsualizarCierre("2026-08-03");

    expect(preview.metrics.grossSales).toBe(15000);
    expect(preview.metrics.costAmount).toBe(6000);
    expect(preview.metrics.profitAmount).toBe(9000);
    expect(preview.metrics.incomeAmount).toBe(15000);
    expect(preview.metrics.directSalesCount).toBe(1);
    expect(preview.metrics.deliveredOrdersCount).toBe(1);
  });

  it("items con costo faltante (status missing) se excluyen de costos/utilidad pero cuentan en ventas", async () => {
    dashboardMock.mockResolvedValue({
      pendientes: [],
      agendados: [],
      finalizados: [
        order({
          id: "pedido-sin-costo",
          fechaPedido: "2026-08-04T12:00:00.000Z",
          fechaEntrega: "2026-08-04T12:00:00.000Z",
          subtotal: 0,
          items: [
            {
              productoId: null,
              productoNombre: "Producto sin precio",
              cantidad: 1,
              precioUnitario: 0,
              costoUnitario: 0,
              costoTotal: 0,
              utilidadBruta: 0,
              subtotal: 0
            }
          ]
        })
      ],
      cancelados: [],
      fiadosPendientes: [],
      pedidosNuevos: 0
    });

    const { CierreSemanalService } = await importService();
    const service = new CierreSemanalService(new CierreSemanalRepositoryStub());
    const preview = await service.previsualizarCierre("2026-08-03");

    expect(preview.metrics.grossSales).toBe(0);
    expect(preview.metrics.costAmount).toBe(0);
    expect(preview.metrics.profitAmount).toBe(0);
    expect(preview.snapshot.itemsSinCosto).toBe(1);
  });

  it("pendientes agrupa NUEVO/AGENDADO/PAGADO/PREPARANDO/DESPACHADO; entregados solo ENTREGADO", async () => {
    dashboardMock.mockResolvedValue({
      pendientes: [order({ id: "p-nuevo", estadoPedido: "NUEVO", fechaPedido: "2026-08-04T12:00:00.000Z" })],
      agendados: [order({ id: "p-agendado", estadoPedido: "AGENDADO", fechaPedido: "2026-08-05T12:00:00.000Z" })],
      finalizados: [
        order({ id: "p-pagado", estadoPedido: "PAGADO", fechaPedido: "2026-08-05T12:00:00.000Z", fechaPago: "2026-08-05T12:00:00.000Z" }),
        order({ id: "p-entregado", estadoPedido: "ENTREGADO", fechaPedido: "2026-08-06T12:00:00.000Z", fechaEntrega: "2026-08-06T12:00:00.000Z" })
      ],
      cancelados: [order({ id: "p-cancelado", estadoPedido: "CANCELADO", fechaPedido: "2026-08-06T12:00:00.000Z" })],
      fiadosPendientes: [],
      pedidosNuevos: 1
    });

    const { CierreSemanalService } = await importService();
    const service = new CierreSemanalService(new CierreSemanalRepositoryStub());
    const preview = await service.previsualizarCierre("2026-08-03");

    expect(preview.metrics.pendingOrdersCount).toBe(3);
    expect(preview.metrics.deliveredOrdersCount).toBe(1);
    expect(preview.metrics.cancelledOrdersCount).toBe(1);
    expect(preview.metrics.ordersCount).toBe(5);
  });

  it("fiado/saldo pendiente suma monto_pendiente de fiados con fecha_fiado en el periodo", async () => {
    dashboardMock.mockResolvedValue({
      pendientes: [],
      agendados: [],
      finalizados: [],
      cancelados: [],
      fiadosPendientes: [],
      pedidosNuevos: 0
    });

    fiadosMock.mockResolvedValue([
      { id: "fiado-1", pedidoId: "x", clienteId: "c1", montoPendiente: 5000, estado: "PENDIENTE", fechaFiado: "2026-08-04T12:00:00.000Z" },
      { id: "fiado-2", pedidoId: "y", clienteId: "c2", montoPendiente: 7000, estado: "PENDIENTE", fechaFiado: "2026-07-01T12:00:00.000Z" }
    ]);

    const { CierreSemanalService } = await importService();
    const service = new CierreSemanalService(new CierreSemanalRepositoryStub());
    const preview = await service.previsualizarCierre("2026-08-03");

    expect(preview.metrics.outstandingAmount).toBe(5000);
  });

  it("no persiste nada: previsualizarCierre nunca llama a crearCierre del repositorio", async () => {
    dashboardMock.mockResolvedValue({
      pendientes: [],
      agendados: [],
      finalizados: [],
      cancelados: [],
      fiadosPendientes: [],
      pedidosNuevos: 0
    });

    const { CierreSemanalService } = await importService();
    const stub = new CierreSemanalRepositoryStub();
    const service = new CierreSemanalService(stub);
    await service.previsualizarCierre("2026-08-03");

    expect(stub.created).toHaveLength(0);
  });
});

describe("CierreSemanalService - crearCierre", () => {
  beforeEach(() => {
    dashboardMock.mockResolvedValue({
      pendientes: [],
      agendados: [],
      finalizados: [],
      cancelados: [],
      fiadosPendientes: [],
      pedidosNuevos: 0
    });
  });

  it("rechaza cerrar si ya existe un cierre activo para el periodo (verificacion previa, WC001)", async () => {
    const { CierreSemanalService } = await importService();
    const stub = new CierreSemanalRepositoryStub();
    stub.activeByPeriod = { id: "existente" } as CierreSemanal;
    const service = new CierreSemanalService(stub);

    await expect(service.crearCierre("2026-08-03", {})).rejects.toMatchObject({ code: "WC001" });
    expect(stub.created).toHaveLength(0);
  });

  it("crea el cierre delegando la identidad del admin al repositorio", async () => {
    const { CierreSemanalService } = await importService();
    const stub = new CierreSemanalRepositoryStub();
    const service = new CierreSemanalService(stub);
    const admin: AdminIdentidad = { email: "admin@smellme.cl", nombre: "Admin" };

    const result = await service.crearCierre("2026-08-03", admin);

    expect(stub.created).toHaveLength(1);
    expect(stub.created[0].admin).toEqual(admin);
    expect(result.closedByEmail).toBe("admin@smellme.cl");
  });
});

describe("CierreSemanalService - reabrirCierre", () => {
  it("valida el motivo antes de llamar al repositorio (menos de 5 caracteres nunca llega al repositorio)", async () => {
    const { CierreSemanalService } = await importService();
    const stub = new CierreSemanalRepositoryStub();
    const service = new CierreSemanalService(stub);

    await expect(service.reabrirCierre("cierre-1", "ab", {})).rejects.toThrow(/al menos 5 caracteres/i);
    expect(stub.reopened).toHaveLength(0);
  });

  it("reabre correctamente con un motivo valido y propaga la identidad del admin", async () => {
    dashboardMock.mockResolvedValue({
      pendientes: [],
      agendados: [],
      finalizados: [],
      cancelados: [],
      fiadosPendientes: [],
      pedidosNuevos: 0
    });

    const { CierreSemanalService } = await importService();
    const stub = new CierreSemanalRepositoryStub();
    const service = new CierreSemanalService(stub);
    const created = await service.crearCierre("2026-08-03", {});

    const reopened = await service.reabrirCierre(created.id, "Motivo administrativo valido", {
      email: "admin@smellme.cl",
      nombre: "Admin"
    });

    expect(reopened.status).toBe("REOPENED");
    expect(stub.reopened[0]).toMatchObject({
      closureId: created.id,
      reason: "Motivo administrativo valido",
      admin: { email: "admin@smellme.cl", nombre: "Admin" }
    });
  });
});

describe("CierreSemanalService - exportarCsv", () => {
  it("rechaza exportar un cierre inexistente (WC002)", async () => {
    const { CierreSemanalService } = await importService();
    const service = new CierreSemanalService(new CierreSemanalRepositoryStub());
    await expect(service.exportarCsv("no-existe")).rejects.toMatchObject({ code: "WC002" });
  });

  it("genera un CSV sin exponer el motivo de reapertura completo", async () => {
    dashboardMock.mockResolvedValue({
      pendientes: [],
      agendados: [],
      finalizados: [],
      cancelados: [],
      fiadosPendientes: [],
      pedidosNuevos: 0
    });

    const { CierreSemanalService } = await importService();
    const stub = new CierreSemanalRepositoryStub();
    const service = new CierreSemanalService(stub);
    const created = await service.crearCierre("2026-08-03", {});
    await service.reabrirCierre(created.id, "Motivo secreto administrativo detallado", {});

    const { filename, content } = await service.exportarCsv(created.id);
    expect(filename).toBe("smellme-cierre-semanal-2026-08-03-v1.csv");
    expect(content).toContain("Tiene motivo de reapertura,si");
    expect(content).not.toContain("Motivo secreto administrativo detallado");
  });
});
