import { describe, expect, it } from "vitest";
import {
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

  it("mantiene pedidos agendados sin ver como pendientes de atencion", () => {
    expect(
      needsAdminOrderAttention({
        estadoPedido: "AGENDADO",
        adminSeen: false,
        fechaEntrega: "2026-06-24"
      })
    ).toBe(true);
  });

  it("excluye pedidos cerrados del contador", () => {
    const orders = [
      { estadoPedido: "FINALIZADO", adminSeen: false, fechaEntrega: "2026-06-24" },
      { estadoPedido: "CANCELADO", adminSeen: false }
    ];

    expect(getPendingAdminOrders(orders)).toHaveLength(0);
  });
});
