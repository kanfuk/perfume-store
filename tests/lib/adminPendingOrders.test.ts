import { describe, expect, it } from "vitest";
import {
  getNewAdminOrdersCount,
  getPendingAdminOrders,
  getPendingAdminOrdersCount,
  needsAdminOrderAttention
} from "@/lib/admin/getPendingAdminOrders";

describe("getPendingAdminOrders", () => {
  it("cuenta pedidos pendientes aunque ya esten vistos", () => {
    const orders = [
      { estadoPedido: "PENDIENTE", adminSeen: true },
      { estadoPedido: "AGENDADO", adminSeen: true, fechaEntrega: "2026-06-24" }
    ];

    expect(getPendingAdminOrdersCount(orders)).toBe(1);
  });

  it("solo considera nuevos de atencion a pendientes no vistos", () => {
    expect(
      needsAdminOrderAttention({
        estadoPedido: "PENDIENTE",
        adminSeen: false,
        fechaEntrega: undefined
      })
    ).toBe(true);

    expect(
      needsAdminOrderAttention({
        estadoPedido: "PENDIENTE",
        adminSeen: true
      })
    ).toBe(false);
  });

  it("separa el contador de pendientes reales del contador de nuevos", () => {
    const orders = [
      { estadoPedido: "PENDIENTE", adminSeen: false },
      { estadoPedido: "PENDIENTE", adminSeen: true },
      { estadoPedido: "AGENDADO", adminSeen: false, fechaEntrega: "2026-06-24" }
    ];

    expect(getPendingAdminOrdersCount(orders)).toBe(2);
    expect(getNewAdminOrdersCount(orders)).toBe(1);
  });

  it("mantiene como pendiente un pedido con fecha de entrega mientras no este agendado", () => {
    const orders = [
      {
        estadoPedido: "PENDIENTE",
        adminSeen: false,
        fechaEntrega: "2026-06-26"
      }
    ];

    expect(getPendingAdminOrdersCount(orders)).toBe(1);
    expect(getNewAdminOrdersCount(orders)).toBe(1);
  });

  it("excluye pedidos cerrados del contador", () => {
    const orders = [
      { estadoPedido: "FINALIZADO", adminSeen: false, fechaEntrega: "2026-06-24" },
      { estadoPedido: "CANCELADO", adminSeen: false }
    ];

    expect(getPendingAdminOrders(orders)).toHaveLength(0);
  });
});
