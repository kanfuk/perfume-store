import { describe, expect, it } from "vitest";
import type { ProductoProps } from "@/domain/Producto";
import type { LocalOrderItemRecord, LocalOrderRecord } from "@/lib/local-store";
import {
  computeEffectiveTopRanking,
  validateTopRankingConfiguration
} from "@/lib/top-products-ranking";

const NOW = new Date("2026-08-07T12:00:00.000Z");

function product(id: string, overrides: Partial<ProductoProps> = {}): ProductoProps {
  return {
    id,
    nombre: `Perfume ${id}`,
    marca: "Marca",
    contenido: "100 ml",
    precioVenta: 10000,
    stockActual: 10,
    activo: true,
    ...overrides
  };
}

function order(id: string, overrides: Partial<LocalOrderRecord> = {}): LocalOrderRecord {
  return {
    id,
    clienteId: "cliente-1",
    estadoPedido: "ENTREGADO",
    estadoPago: "PAGADO",
    subtotal: 10000,
    costoDespacho: 0,
    total: 10000,
    fechaPedido: "2026-08-01T12:00:00.000Z",
    ...overrides
  };
}

function item(
  pedidoId: string,
  productoId: string,
  cantidad: number,
  subtotal = cantidad * 10000
): LocalOrderItemRecord {
  return {
    id: `${pedidoId}-${productoId}`,
    pedidoId,
    productoId,
    cantidad,
    precioUnitario: 10000,
    costoUnitario: 5000,
    costoTotal: cantidad * 5000,
    utilidadBruta: cantidad * 5000,
    subtotal
  };
}

describe("Top 15 efectivo", () => {
  it("MANUAL conserva las posiciones editoriales sin calcular ventas", () => {
    const result = computeEffectiveTopRanking({
      products: [product("a", { esTop: true, ordenDestacado: 4 }), product("b")],
      orders: [order("paid")],
      orderItems: [item("paid", "a", 2)],
      configuration: { mode: "MANUAL", salesWindowDays: 30 },
      now: NOW
    });

    expect(result).toEqual([
      { rank: 4, productId: "a", source: "MANUAL", unitsSold: 0, revenue: 0 }
    ]);
  });

  it("AUTOMATIC ordena por unidades, luego facturación, e ignora ventas inválidas", () => {
    const result = computeEffectiveTopRanking({
      products: [product("a"), product("b"), product("c")],
      orders: [
        order("paid"),
        order("cancelled", { estadoPedido: "CANCELADO" }),
        order("unpaid", { estadoPago: "SIN_PAGO" }),
        order("old", { fechaPedido: "2026-01-01T00:00:00.000Z" })
      ],
      orderItems: [
        item("paid", "a", 3, 30000),
        item("paid", "b", 3, 45000),
        item("paid", "c", 2),
        item("cancelled", "c", 100),
        item("unpaid", "c", 100),
        item("old", "c", 100)
      ],
      configuration: { mode: "AUTOMATIC", salesWindowDays: 30 },
      now: NOW
    });

    expect(result.map(({ rank, productId, source }) => ({ rank, productId, source }))).toEqual([
      { rank: 1, productId: "b", source: "AUTOMATIC" },
      { rank: 2, productId: "a", source: "AUTOMATIC" },
      { rank: 3, productId: "c", source: "AUTOMATIC" }
    ]);
  });

  it("HYBRID fija manuales y rellena solo los huecos sin duplicar productos", () => {
    const result = computeEffectiveTopRanking({
      products: [
        product("manual", { esTop: true, ordenDestacado: 2 }),
        product("auto-a"),
        product("auto-b")
      ],
      orders: [order("paid")],
      orderItems: [
        item("paid", "manual", 20),
        item("paid", "auto-a", 10),
        item("paid", "auto-b", 5)
      ],
      configuration: { mode: "HYBRID", salesWindowDays: 30 },
      now: NOW
    });

    expect(result.map(({ rank, productId, source }) => ({ rank, productId, source }))).toEqual([
      { rank: 1, productId: "auto-a", source: "AUTOMATIC" },
      { rank: 2, productId: "manual", source: "MANUAL" },
      { rank: 3, productId: "auto-b", source: "AUTOMATIC" }
    ]);
  });

  it("excluye del automático productos no vendibles", () => {
    const result = computeEffectiveTopRanking({
      products: [product("ok"), product("paused", { activo: false }), product("empty", { stockActual: 0 })],
      orders: [order("paid")],
      orderItems: [item("paid", "paused", 20), item("paid", "empty", 15), item("paid", "ok", 1)],
      configuration: { mode: "AUTOMATIC", salesWindowDays: 30 },
      now: NOW
    });

    expect(result.map((entry) => entry.productId)).toEqual(["ok"]);
  });

  it("HISTORICAL incluye ventas pagadas sin límite de fecha", () => {
    const result = computeEffectiveTopRanking({
      products: [product("old-sale")],
      orders: [order("old", { fechaPedido: "2010-01-01T00:00:00.000Z" })],
      orderItems: [item("old", "old-sale", 3)],
      configuration: { mode: "AUTOMATIC", salesWindowDays: null },
      now: NOW
    });

    expect(result[0]).toMatchObject({ productId: "old-sale", unitsSold: 3 });
  });
});

describe("configuración del Top 15", () => {
  it("acepta modos soportados y una ventana entera", () => {
    expect(validateTopRankingConfiguration({ mode: "HYBRID", salesWindowDays: "60" })).toEqual({
      mode: "HYBRID",
      salesWindowDays: 60
    });
  });

  it("acepta histórico completo como ventana nula", () => {
    expect(validateTopRankingConfiguration({ mode: "AUTOMATIC", salesWindowDays: null })).toEqual({
      mode: "AUTOMATIC",
      salesWindowDays: null
    });
  });

  it("rechaza modo o ventana fuera de rango", () => {
    expect(() => validateTopRankingConfiguration({ mode: "RANDOM", salesWindowDays: 30 })).toThrow();
    expect(() => validateTopRankingConfiguration({ mode: "AUTOMATIC", salesWindowDays: 0 })).toThrow();
  });
});
