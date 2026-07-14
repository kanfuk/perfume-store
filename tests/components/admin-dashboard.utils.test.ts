import { describe, expect, it } from "vitest";
import {
  getProductCostStatus,
  resolveOrderItemProfitabilityCost
} from "@/components/admin/dashboard/admin-dashboard.utils";
import type { AdminProductRecord, AdminOrderSummary } from "@/lib/types";

function createProduct(overrides: Partial<AdminProductRecord> = {}): AdminProductRecord {
  return {
    id: "prod-1",
    nombre: "Dobladita",
    descripcion: "",
    precioVenta: 2000,
    imageUrl: "",
    badgeLabel: "",
    costoUnitario: 0,
    stockActual: 10,
    stockAgenda: 10,
    activo: true,
    tipoProducto: "simple",
    utilidadUnitaria: 0,
    ...overrides
  };
}

function createOrderItem(
  overrides: Partial<AdminOrderSummary["items"][number]> = {}
): AdminOrderSummary["items"][number] {
  return {
    productoId: "prod-1",
    productoNombre: "Dobladita",
    cantidad: 2,
    precioUnitario: 2000,
    costoUnitario: 0,
    costoTotal: 0,
    utilidadBruta: 0,
    subtotal: 4000,
    ...overrides
  };
}

describe("admin-dashboard.utils", () => {
  it("prioriza costo manual del producto", () => {
    const result = resolveOrderItemProfitabilityCost(
      createOrderItem(),
      [createProduct({ costoUnitario: 1200 })]
    );

    expect(result.status).toBe("real");
    expect(result.unitCost).toBe(1200);
    expect(result.totalCost).toBe(2400);
    expect(result.profit).toBe(1600);
  });

  it("usa estimacion del 50% cuando no existe costo manual", () => {
    const result = resolveOrderItemProfitabilityCost(
      createOrderItem(),
      [createProduct({ costoUnitario: 0, precioVenta: 2000 })]
    );

    expect(result.status).toBe("estimated");
    expect(result.totalCost).toBe(2000);
    expect(result.unitCost).toBe(1000);
    expect(result.profit).toBe(2000);
  });

  it("clasifica estado de costo por producto", () => {
    expect(getProductCostStatus(createProduct({ costoUnitario: 900 }))).toBe("real");
    expect(getProductCostStatus(createProduct({ costoUnitario: 0, precioVenta: 2000 }))).toBe(
      "estimated"
    );
    expect(getProductCostStatus(createProduct({ costoUnitario: 0, precioVenta: 0 }))).toBe(
      "missing"
    );
  });
});
