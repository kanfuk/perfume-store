import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAdmin } = vi.hoisted(() => ({
  getAuthenticatedAdmin: vi.fn(
    async (): Promise<{ userId: string; profileId: string; rol: "ADMIN" | "OWNER" } | null> => ({
      userId: "auth-1",
      profileId: "admin-1",
      rol: "ADMIN"
    })
  )
}));
const { evaluarElegibilidad } = vi.hoisted(() => ({ evaluarElegibilidad: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ getAuthenticatedAdmin }));
vi.mock("@/services/productRemovalService", () => ({
  createProductRemovalService: () => ({ evaluarElegibilidad })
}));

import { GET } from "@/app/api/admin/products/[productId]/removal-eligibility/route";

function ctx(productId = "producto-1") {
  return { params: Promise.resolve({ productId }) };
}

function getRequest() {
  return new Request("http://localhost/api/admin/products/producto-1/removal-eligibility");
}

describe("GET /api/admin/products/[productId]/removal-eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedAdmin.mockResolvedValue({ userId: "auth-1", profileId: "admin-1", rol: "ADMIN" as const });
  });

  it("responde 401 sin admin autenticado", async () => {
    getAuthenticatedAdmin.mockResolvedValue(null);

    const response = await GET(getRequest(), ctx());

    expect(response.status).toBe(401);
    expect(evaluarElegibilidad).not.toHaveBeenCalled();
  });

  it("responde la elegibilidad calculada por el servicio (solo lectura, no muta nada)", async () => {
    evaluarElegibilidad.mockResolvedValue({
      mode: "ARCHIVE",
      reason: "HISTORICAL_SALES_CLOSED",
      activeOrders: 0,
      openWeekSales: 0,
      historicalSales: 3
    });

    const response = await GET(getRequest(), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      mode: "ARCHIVE",
      reason: "HISTORICAL_SALES_CLOSED",
      activeOrders: 0,
      openWeekSales: 0,
      historicalSales: 3
    });
  });

  it("producto inexistente: responde 404", async () => {
    evaluarElegibilidad.mockRejectedValue(new Error("Producto no encontrado."));

    const response = await GET(getRequest(), ctx());

    expect(response.status).toBe(404);
  });
});
