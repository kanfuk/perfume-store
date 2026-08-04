import { describe, expect, it } from "vitest";
import { selectRecentConfirmedSales } from "@/lib/admin-sales-summary.ts";
import type { AdminOrderSummary } from "@/lib/types.ts";

/**
 * Regresion: la pestaña "Ventas" (vista "cobros") solo mostraba pedidos
 * agendados por cobrar y fiados abiertos. Una venta ya cerrada y pagada
 * (publica, directa o personalizada) no tenia ninguna representacion ahi,
 * aunque si se contabilizara correctamente en Reportes -- por eso el admin
 * reportaba "confirme una venta y no aparece en Ventas".
 */
function buildOrder(overrides: Partial<AdminOrderSummary>): AdminOrderSummary {
  return {
    id: "order-1",
    codigo: "SM-0001",
    clienteId: "cliente-1",
    clienteNombre: "Cliente de prueba",
    clienteTelefono: "+56900000000",
    clienteLugarTrabajo: "",
    productoId: "producto-1",
    productoNombre: "Producto de prueba",
    cantidad: 1,
    precioUnitario: 10000,
    subtotal: 10000,
    items: [],
    estadoPedido: "ENTREGADO",
    estadoPago: "PAGADO",
    origenPedido: "PUBLICO",
    total: 10000,
    totalCost: 5000,
    grossProfit: 5000,
    fechaPedido: "2026-08-01T10:00:00.000Z",
    totalPagado: 10000,
    saldoPendiente: 0,
    pagosRegistrados: 1,
    ...overrides
  };
}

describe("selectRecentConfirmedSales", () => {
  it("incluye ventas pagadas de los tres origenes (publico, directa, personalizada)", () => {
    const finalizados = [
      buildOrder({ id: "publico-1", origenPedido: "PUBLICO", fechaPedido: "2026-08-01T10:00:00.000Z" }),
      buildOrder({ id: "directa-1", origenPedido: "ADMIN_DIRECTO", fechaPedido: "2026-08-01T09:00:00.000Z" }),
      buildOrder({ id: "personalizada-1", origenPedido: "PERSONALIZADO", fechaPedido: "2026-08-01T08:00:00.000Z" })
    ];

    const result = selectRecentConfirmedSales(finalizados);

    expect(result.recent.map((o) => o.id)).toEqual(["publico-1", "directa-1", "personalizada-1"]);
    expect(result.total).toBe(3);
  });

  it("excluye fiados abiertos (estadoPago SIN_PAGO), ya mostrados en Fiados pendientes", () => {
    const finalizados = [
      buildOrder({ id: "pagado-1", estadoPago: "PAGADO" }),
      buildOrder({ id: "fiado-1", estadoPago: "SIN_PAGO", saldoPendiente: 5000 })
    ];

    const result = selectRecentConfirmedSales(finalizados);

    expect(result.recent.map((o) => o.id)).toEqual(["pagado-1"]);
    expect(result.total).toBe(1);
  });

  it("excluye pedidos cancelados aunque quedaran marcados como PAGADO", () => {
    const finalizados = [
      buildOrder({ id: "pagado-1", estadoPago: "PAGADO", estadoPedido: "ENTREGADO" }),
      buildOrder({ id: "cancelado-1", estadoPago: "PAGADO", estadoPedido: "CANCELADO" })
    ];

    const result = selectRecentConfirmedSales(finalizados);

    expect(result.recent.map((o) => o.id)).toEqual(["pagado-1"]);
    expect(result.total).toBe(1);
  });

  it("con mas de ocho ventas, muestra solo las ocho mas recientes pero informa el total real", () => {
    const finalizados = Array.from({ length: 12 }, (_, i) =>
      buildOrder({
        id: `order-${i}`,
        fechaPedido: `2026-08-${String(12 - i).padStart(2, "0")}T10:00:00.000Z`
      })
    );

    const result = selectRecentConfirmedSales(finalizados);

    expect(result.total).toBe(12);
    expect(result.recent).toHaveLength(8);
    expect(result.recent[0].id).toBe("order-0");
    expect(result.recent[7].id).toBe("order-7");
  });

  it("el total suma correctamente (monto y conteo) sobre todas las ventas confirmadas, no solo las visibles", () => {
    const finalizados = Array.from({ length: 10 }, (_, i) =>
      buildOrder({ id: `order-${i}`, total: 1000 * (i + 1), fechaPedido: `2026-08-${String(10 - i).padStart(2, "0")}T10:00:00.000Z` })
    );

    const result = selectRecentConfirmedSales(finalizados);
    const sumaTotalVisible = result.recent.reduce((sum, o) => sum + o.total, 0);
    const sumaTotalReal = finalizados.reduce((sum, o) => sum + o.total, 0);

    expect(result.total).toBe(10);
    expect(sumaTotalVisible).toBe(8000 + 7000 + 6000 + 5000 + 4000 + 3000 + 2000 + 1000);
    expect(sumaTotalReal).toBe(55000);
  });

  it("ordena en forma descendente por fecha efectiva (entrega > pago > pedido), sin depender del orden de entrada", () => {
    const finalizados = [
      buildOrder({ id: "viejo", fechaPedido: "2026-08-01T00:00:00.000Z" }),
      buildOrder({ id: "nuevo", fechaPedido: "2026-08-03T00:00:00.000Z" }),
      buildOrder({ id: "medio", fechaPedido: "2026-08-02T00:00:00.000Z" })
    ];

    const result = selectRecentConfirmedSales(finalizados);

    expect(result.recent.map((o) => o.id)).toEqual(["nuevo", "medio", "viejo"]);
  });

  it("usa fechaEntrega por sobre fechaPago y fechaPedido para ordenar (fecha efectiva)", () => {
    const finalizados = [
      buildOrder({ id: "a", fechaPedido: "2026-08-01T00:00:00.000Z", fechaEntrega: "2026-08-05T00:00:00.000Z" }),
      buildOrder({ id: "b", fechaPedido: "2026-08-04T00:00:00.000Z" })
    ];

    const result = selectRecentConfirmedSales(finalizados);

    expect(result.recent.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("no muta la lista original recibida", () => {
    const finalizados = [buildOrder({ id: "a" }), buildOrder({ id: "b" })];
    const snapshot = [...finalizados];

    selectRecentConfirmedSales(finalizados);

    expect(finalizados).toEqual(snapshot);
  });

  it("con una lista vacia devuelve total 0 y ninguna venta reciente", () => {
    const result = selectRecentConfirmedSales([]);
    expect(result).toEqual({ total: 0, recent: [] });
  });
});
