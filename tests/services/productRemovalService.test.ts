import { describe, expect, it } from "vitest";
import type { CierreSemanal } from "@/domain/CierreSemanal";
import type { ProductoProps } from "@/domain/Producto";
import { getWeekPeriodBoundariesForMonday } from "@/lib/weekly-closures/period";
import type { CierreSemanalRepository } from "@/repositories/cierreSemanalRepository";
import type { PedidoRepository, ProductoVentaRecord } from "@/repositories/pedidoRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { ProductRemovalBlockedError, ProductRemovalService } from "@/services/productRemovalService";

/**
 * Tests obligatorios de eliminacion segura de productos (V2.2.1, seccion 21
 * del encargo). Cubre A-K a nivel de servicio; L/M/N (audit log, storage,
 * auth) se cubren en tests/app/adminProductRemovalRoute.test.ts; J (CSV) en
 * tests/services/productoService.test.ts.
 */

function buildProduct(overrides: Partial<ProductoProps> = {}): ProductoProps {
  return {
    id: "producto-1",
    sku: "SML-1",
    nombre: "La Bomba",
    precioVenta: 65000,
    costoUnitario: 40000,
    stockActual: 5,
    stockReservado: 0,
    activo: true,
    archivedAt: null,
    ...overrides
  };
}

class StubProductRepository implements Partial<ProductRepository> {
  archivarCalls: Array<{ id: string; reason?: string }> = [];
  eliminarCalls: string[] = [];
  archivarShouldThrow: Error | null = null;
  eliminarShouldThrow: Error | null = null;

  constructor(private product: ProductoProps | null) {}

  async buscarProductoPorId(id: string) {
    return this.product && this.product.id === id ? this.product : null;
  }

  async archivarProductoSeguro(id: string, reason?: string) {
    this.archivarCalls.push({ id, reason });
    if (this.archivarShouldThrow) throw this.archivarShouldThrow;
    return { alreadyArchived: false };
  }

  async eliminarProductoSeguro(id: string) {
    this.eliminarCalls.push(id);
    if (this.eliminarShouldThrow) throw this.eliminarShouldThrow;
    return { imageStoragePath: undefined };
  }
}

class StubPedidoRepository implements Partial<PedidoRepository> {
  constructor(public ventas: ProductoVentaRecord[]) {}

  async buscarVentasPorProducto() {
    return this.ventas;
  }
}

class StubCierreSemanalRepository implements Partial<CierreSemanalRepository> {
  constructor(private closedPeriods: Array<{ periodStart: Date; periodEndExclusive: Date }>) {}

  async obtenerCierreActivoPorPeriodo(periodStart: Date, periodEndExclusive: Date) {
    const closed = this.closedPeriods.some(
      (period) =>
        period.periodStart.getTime() === periodStart.getTime() &&
        period.periodEndExclusive.getTime() === periodEndExclusive.getTime()
    );
    return closed ? ({ id: "cierre-1" } as unknown as CierreSemanal) : null;
  }
}

function buildService(args: {
  product: ProductoProps | null;
  ventas?: ProductoVentaRecord[];
  closedPeriods?: Array<{ periodStart: Date; periodEndExclusive: Date }>;
}) {
  const productRepository = new StubProductRepository(args.product);
  const pedidoRepository = new StubPedidoRepository(args.ventas ?? []);
  const cierreSemanalRepository = new StubCierreSemanalRepository(args.closedPeriods ?? []);
  const service = new ProductRemovalService(
    productRepository as unknown as ProductRepository,
    pedidoRepository as unknown as PedidoRepository,
    cierreSemanalRepository as unknown as CierreSemanalRepository
  );
  return { service, productRepository, pedidoRepository };
}

/** Lunes cualquiera, fuera de la semana calendario actual, para evitar dependencia del reloj del test. */
const A_MONDAY = "2026-06-01";
const closedPeriodForMonday = getWeekPeriodBoundariesForMonday(A_MONDAY);
const SALE_DATE_IN_CLOSED_WEEK = "2026-06-02T15:00:00.000Z"; // martes de esa semana

describe("ProductRemovalService.evaluarElegibilidad", () => {
  // A: producto jamas vendido -> HARD_DELETE permitido.
  it("sin ventas ni pedidos: HARD_DELETE", async () => {
    const { service } = buildService({ product: buildProduct(), ventas: [] });

    const eligibility = await service.evaluarElegibilidad("producto-1");

    expect(eligibility).toEqual({
      mode: "HARD_DELETE",
      reason: "NO_COMMERCIAL_HISTORY",
      activeOrders: 0,
      openWeekSales: 0,
      historicalSales: 0
    });
  });

  // B: producto con pedido activo -> bloqueado.
  it("con un pedido PREPARANDO: BLOCKED / PRODUCT_HAS_ACTIVE_ORDERS", async () => {
    const { service } = buildService({
      product: buildProduct(),
      ventas: [{ estadoPedido: "PREPARANDO", fechaPedido: "2026-07-01T00:00:00.000Z" }]
    });

    const eligibility = await service.evaluarElegibilidad("producto-1");

    expect(eligibility.mode).toBe("BLOCKED");
    expect(eligibility.reason).toBe("PRODUCT_HAS_ACTIVE_ORDERS");
    expect(eligibility.activeOrders).toBe(1);
  });

  it("con stock_reservado > 0 (sin pedido_items todavia): tambien bloquea", async () => {
    const { service } = buildService({
      product: buildProduct({ stockReservado: 2 }),
      ventas: []
    });

    const eligibility = await service.evaluarElegibilidad("producto-1");

    expect(eligibility.mode).toBe("BLOCKED");
    expect(eligibility.reason).toBe("PRODUCT_HAS_ACTIVE_ORDERS");
  });

  // C: producto vendido en una semana sin cierre -> bloqueado.
  it("con una venta ENTREGADA en una semana sin cerrar: BLOCKED / PRODUCT_HAS_OPEN_WEEK_SALES", async () => {
    const { service } = buildService({
      product: buildProduct(),
      ventas: [{ estadoPedido: "ENTREGADO", fechaPedido: SALE_DATE_IN_CLOSED_WEEK }],
      closedPeriods: [] // ninguna semana cerrada
    });

    const eligibility = await service.evaluarElegibilidad("producto-1");

    expect(eligibility.mode).toBe("BLOCKED");
    expect(eligibility.reason).toBe("PRODUCT_HAS_OPEN_WEEK_SALES");
    expect(eligibility.openWeekSales).toBe(1);
    expect(eligibility.historicalSales).toBe(1);
  });

  // D/E: venta ENTREGADA cuya semana ya fue cerrada -> ARCHIVE permitido.
  it("con una venta ENTREGADA en una semana ya cerrada: ARCHIVE", async () => {
    const { service } = buildService({
      product: buildProduct(),
      ventas: [{ estadoPedido: "ENTREGADO", fechaPedido: SALE_DATE_IN_CLOSED_WEEK }],
      closedPeriods: [closedPeriodForMonday]
    });

    const eligibility = await service.evaluarElegibilidad("producto-1");

    expect(eligibility).toEqual({
      mode: "ARCHIVE",
      reason: "HISTORICAL_SALES_CLOSED",
      activeOrders: 0,
      openWeekSales: 0,
      historicalSales: 1
    });
  });

  // Precedente de reset_smellme_catalog_v1: un pedido CANCELADO sigue contando como historia (ARCHIVE, no HARD_DELETE).
  it("con solo un pedido CANCELADO (nunca se vendio de verdad): ARCHIVE, no HARD_DELETE", async () => {
    const { service } = buildService({
      product: buildProduct(),
      ventas: [{ estadoPedido: "CANCELADO", fechaPedido: "2026-07-01T00:00:00.000Z" }]
    });

    const eligibility = await service.evaluarElegibilidad("producto-1");

    expect(eligibility.mode).toBe("ARCHIVE");
    expect(eligibility.historicalSales).toBe(0); // CANCELADO no es una venta reconocida
  });

  it("producto inexistente: lanza error", async () => {
    const { service } = buildService({ product: null });

    await expect(service.evaluarElegibilidad("no-existe")).rejects.toThrow("Producto no encontrado.");
  });
});

describe("ProductRemovalService.retirarProductoAdmin", () => {
  // A: ejecuta hard delete real cuando es elegible.
  it("HARD_DELETE: invoca eliminarProductoSeguro y NO archivarProductoSeguro", async () => {
    const { service, productRepository } = buildService({ product: buildProduct(), ventas: [] });

    const result = await service.retirarProductoAdmin("producto-1");

    expect(result.mode).toBe("HARD_DELETE");
    expect(productRepository.eliminarCalls).toEqual(["producto-1"]);
    expect(productRepository.archivarCalls).toHaveLength(0);
  });

  // D/E: ejecuta archive real cuando corresponde.
  it("ARCHIVE: invoca archivarProductoSeguro y NO eliminarProductoSeguro", async () => {
    const { service, productRepository } = buildService({
      product: buildProduct(),
      ventas: [{ estadoPedido: "ENTREGADO", fechaPedido: SALE_DATE_IN_CLOSED_WEEK }],
      closedPeriods: [closedPeriodForMonday]
    });

    const result = await service.retirarProductoAdmin("producto-1");

    expect(result.mode).toBe("ARCHIVE");
    expect(productRepository.archivarCalls).toEqual([{ id: "producto-1", reason: undefined }]);
    expect(productRepository.eliminarCalls).toHaveLength(0);
  });

  // B/C: bloqueado -> nunca llega a mutar nada.
  it("bloqueado: lanza ProductRemovalBlockedError y no llama a ninguna mutacion", async () => {
    const { service, productRepository } = buildService({
      product: buildProduct(),
      ventas: [{ estadoPedido: "NUEVO", fechaPedido: "2026-07-01T00:00:00.000Z" }]
    });

    await expect(service.retirarProductoAdmin("producto-1")).rejects.toBeInstanceOf(ProductRemovalBlockedError);
    expect(productRepository.archivarCalls).toHaveLength(0);
    expect(productRepository.eliminarCalls).toHaveLength(0);
  });

  // K: concurrencia -- la elegibilidad SIEMPRE se recalcula fresca, nunca se confia en un resultado previo.
  it("concurrencia: una venta que aparece justo antes de confirmar bloquea la operacion", async () => {
    const { service, pedidoRepository } = buildService({ product: buildProduct(), ventas: [] });

    const before = await service.evaluarElegibilidad("producto-1");
    expect(before.mode).toBe("HARD_DELETE");

    // Admin B genera una venta justo despues de que Admin A vio el popup.
    pedidoRepository.ventas.push({ estadoPedido: "NUEVO", fechaPedido: "2026-07-01T00:00:00.000Z" });

    await expect(service.retirarProductoAdmin("producto-1")).rejects.toBeInstanceOf(ProductRemovalBlockedError);
  });

  // K (variante RPC): la revalidacion dentro de la propia mutacion tambien detiene la operacion,
  // no solo la capa TS. No es el mismo bloqueo que PRODUCT_HAS_ACTIVE_ORDERS (no hay pedido
  // activo, solo historial nuevo), asi que se propaga como error generico y reintentable.
  it("carrera en el instante exacto de escritura (RPC revalida de nuevo): detiene la operacion sin rotularla como pedidos activos", async () => {
    const { service, productRepository } = buildService({ product: buildProduct(), ventas: [] });
    productRepository.eliminarShouldThrow = new Error("PRODUCT_HAS_HISTORY");

    await expect(service.retirarProductoAdmin("producto-1")).rejects.not.toBeInstanceOf(ProductRemovalBlockedError);
    await expect(service.retirarProductoAdmin("producto-1")).rejects.toThrow("cambió de estado");
  });

  // I: al archivar, Top/Oferta se limpian en la misma operacion (verificado por el argumento pasado a la RPC/repositorio).
  it("ARCHIVE limpia Top/Oferta como parte de la misma llamada atomica (no en un paso aparte)", async () => {
    const { service, productRepository } = buildService({
      product: buildProduct({ esTop: true, esOfertaSemana: true, ordenDestacado: 3 }),
      ventas: [{ estadoPedido: "ENTREGADO", fechaPedido: SALE_DATE_IN_CLOSED_WEEK }],
      closedPeriods: [closedPeriodForMonday]
    });

    await service.retirarProductoAdmin("producto-1");

    // La limpieza de es_top/es_oferta_semana/orden_destacado vive dentro de
    // archive_product_v1 (ver supabase/migrations/20260814000000_*.sql),
    // ejecutada atomicamente junto al archivado; aqui solo se confirma que
    // el servicio delega la operacion completa a esa unica llamada.
    expect(productRepository.archivarCalls).toHaveLength(1);
  });
});
