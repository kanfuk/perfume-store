import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Cobertura A6/A8: PATCH /api/admin/products/[productId] con mode="rename"
 * registra PRODUCT_NAME_UPDATED con metadata segura (productId/oldName/
 * newName), nunca con secretos, y no pasa por la rama de update/toggle
 * normal (no re-calcula precio/costo/stock).
 */

const { isAdminAuthenticated, getAuthenticatedAdmin } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true),
  getAuthenticatedAdmin: vi.fn(
    async (): Promise<{ userId: string; profileId: string; rol: "ADMIN" | "OWNER" } | null> => ({
      userId: "auth-1",
      profileId: "admin-1",
      rol: "ADMIN"
    })
  )
}));
const { validateTrustedOrigin, validateJsonRequest } = vi.hoisted(() => ({
  validateTrustedOrigin: vi.fn((): Response | null => null),
  validateJsonRequest: vi.fn((): Response | null => null)
}));
const { logAdminAction } = vi.hoisted(() => ({ logAdminAction: vi.fn(async () => {}) }));
const { obtenerProductoAdminPorId, renombrarProductoAdmin } = vi.hoisted(() => ({
  obtenerProductoAdminPorId: vi.fn(async () => ({ id: "producto-1", nombre: "Savauge" })),
  renombrarProductoAdmin: vi.fn(async () => ({ id: "producto-1", nombre: "Sauvage" }))
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated, getAuthenticatedAdmin }));
vi.mock("@/lib/admin-audit", () => ({
  logAdminAction,
  requestAuditId: () => "11111111-1111-4111-8111-111111111111"
}));
vi.mock("@/lib/http-security", () => ({ validateTrustedOrigin, validateJsonRequest }));
vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({ obtenerProductoAdminPorId, renombrarProductoAdmin })
}));

import { PATCH } from "@/app/api/admin/products/[productId]/route";

function ctx(productId = "producto-1") {
  return { params: Promise.resolve({ productId }) };
}

function renameRequest(nuevoNombre: string) {
  return new Request("http://localhost/api/admin/products/producto-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ mode: "rename", nuevoNombre })
  });
}

describe("PATCH /api/admin/products/[productId] mode=rename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminAuthenticated.mockResolvedValue(true);
    getAuthenticatedAdmin.mockResolvedValue({ userId: "auth-1", profileId: "admin-1", rol: "ADMIN" as const });
    validateTrustedOrigin.mockReturnValue(null);
    validateJsonRequest.mockReturnValue(null);
    obtenerProductoAdminPorId.mockResolvedValue({ id: "producto-1", nombre: "Savauge" });
    renombrarProductoAdmin.mockResolvedValue({ id: "producto-1", nombre: "Sauvage" });
  });

  it("responde 401 sin admin autenticado, sin invocar el servicio de rename", async () => {
    getAuthenticatedAdmin.mockResolvedValue(null);

    const response = await PATCH(renameRequest("Sauvage"), ctx());

    expect(response.status).toBe(401);
    expect(renombrarProductoAdmin).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it("llama a renombrarProductoAdmin con el id y el nuevo nombre exactos", async () => {
    const response = await PATCH(renameRequest("Sauvage"), ctx());

    expect(response.status).toBe(200);
    expect(renombrarProductoAdmin).toHaveBeenCalledWith("producto-1", "Sauvage");
  });

  it("registra PRODUCT_NAME_UPDATED con metadata productId/oldName/newName", async () => {
    await PATCH(renameRequest("Sauvage"), ctx());

    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PRODUCT_NAME_UPDATED",
        entityType: "product",
        entityId: "producto-1",
        metadata: { productId: "producto-1", oldName: "Savauge", newName: "Sauvage" }
      })
    );
  });

  it("no registra PRICE_CHANGED, COST_CHANGED ni STOCK_CHANGED en un rename", async () => {
    await PATCH(renameRequest("Sauvage"), ctx());

    expect(logAdminAction).toHaveBeenCalledTimes(1);
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "PRODUCT_NAME_UPDATED" }));
  });

  it("propaga el error de validacion del servicio (nombre invalido) como 400, sin registrar auditoria", async () => {
    renombrarProductoAdmin.mockRejectedValue(new Error("El nombre no puede estar vacío."));

    const response = await PATCH(renameRequest(""), ctx());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("El nombre no puede estar vacío.");
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
