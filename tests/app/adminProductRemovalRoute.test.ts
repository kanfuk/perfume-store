import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductRemovalBlockedError } from "@/services/productRemovalService";

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
const { validateTrustedOrigin } = vi.hoisted(() => ({
  validateTrustedOrigin: vi.fn((): Response | null => null)
}));
const { logAdminAction } = vi.hoisted(() => ({ logAdminAction: vi.fn(async () => {}) }));
const { obtenerProductoAdminPorId } = vi.hoisted(() => ({
  obtenerProductoAdminPorId: vi.fn(async () => ({ id: "producto-1", nombre: "La Bomba" }))
}));
const { retirarProductoAdmin } = vi.hoisted(() => ({ retirarProductoAdmin: vi.fn() }));
const { eliminarImagen } = vi.hoisted(() => ({ eliminarImagen: vi.fn(async () => {}) }));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated, getAuthenticatedAdmin }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAction, requestAuditId: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin,
  validateJsonRequest: vi.fn((): Response | null => null)
}));
vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({ obtenerProductoAdminPorId })
}));
vi.mock("@/services/productRemovalService", async () => {
  const actual = await vi.importActual<typeof import("@/services/productRemovalService")>(
    "@/services/productRemovalService"
  );
  return {
    ...actual,
    createProductRemovalService: () => ({ retirarProductoAdmin })
  };
});
vi.mock("@/repositories/productImageRepository", () => ({
  getProductImageRepository: () => ({ eliminar: eliminarImagen })
}));

import { DELETE } from "@/app/api/admin/products/[productId]/route";

function ctx(productId = "producto-1") {
  return { params: Promise.resolve({ productId }) };
}

function deleteRequest() {
  return new Request("http://localhost/api/admin/products/producto-1", {
    method: "DELETE",
    headers: { Origin: "http://localhost" }
  });
}

describe("DELETE /api/admin/products/[productId] (eliminacion segura V2.2.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminAuthenticated.mockResolvedValue(true);
    getAuthenticatedAdmin.mockResolvedValue({ userId: "auth-1", profileId: "admin-1", rol: "ADMIN" as const });
    validateTrustedOrigin.mockReturnValue(null);
    obtenerProductoAdminPorId.mockResolvedValue({ id: "producto-1", nombre: "La Bomba" });
  });

  // N: RLS/auth - usuario no autorizado no puede eliminar.
  it("responde 401 sin admin autenticado, sin invocar el servicio de eliminacion", async () => {
    getAuthenticatedAdmin.mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(401);
    expect(retirarProductoAdmin).not.toHaveBeenCalled();
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // A: producto sin historia -> HARD_DELETE.
  it("hard delete: responde 200 con mode=HARD_DELETE y registra PRODUCT_DELETED", async () => {
    retirarProductoAdmin.mockResolvedValue({ mode: "HARD_DELETE", imageStoragePath: undefined });

    const response = await DELETE(deleteRequest(), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, mode: "HARD_DELETE" });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PRODUCT_DELETED", entityType: "product", entityId: "producto-1" })
    );
  });

  // M: Storage - la imagen solo se borra en hard delete, con la ruta exacta devuelta.
  it("hard delete con imagen: borra unicamente el storage path devuelto por el servicio", async () => {
    retirarProductoAdmin.mockResolvedValue({ mode: "HARD_DELETE", imageStoragePath: "products/producto-1/foto.webp" });

    await DELETE(deleteRequest(), ctx());

    expect(eliminarImagen).toHaveBeenCalledTimes(1);
    expect(eliminarImagen).toHaveBeenCalledWith("products/producto-1/foto.webp");
  });

  // M: Storage - archivar NUNCA toca imagenes (ni las de este producto ni las de otro).
  it("archive: no invoca el borrado de Storage", async () => {
    retirarProductoAdmin.mockResolvedValue({ mode: "ARCHIVE" });

    const response = await DELETE(deleteRequest(), ctx());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ ok: true, mode: "ARCHIVE" });
    expect(eliminarImagen).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ action: "PRODUCT_ARCHIVED" }));
  });

  // C: bloqueo por semana abierta -> 409 con codigo estable, sin mutar nada.
  it("bloqueado por semana abierta: responde 409 con code=PRODUCT_HAS_OPEN_WEEK_SALES y no registra auditoria", async () => {
    retirarProductoAdmin.mockRejectedValue(new ProductRemovalBlockedError("PRODUCT_HAS_OPEN_WEEK_SALES"));

    const response = await DELETE(deleteRequest(), ctx());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("PRODUCT_HAS_OPEN_WEEK_SALES");
    expect(data.error).toContain("cierre de ventas semanal");
    expect(logAdminAction).not.toHaveBeenCalled();
    expect(eliminarImagen).not.toHaveBeenCalled();
  });

  // B/K: bloqueo por pedidos activos (incluye la revalidacion de concurrencia).
  it("bloqueado por pedidos activos: responde 409 con code=PRODUCT_HAS_ACTIVE_ORDERS", async () => {
    retirarProductoAdmin.mockRejectedValue(new ProductRemovalBlockedError("PRODUCT_HAS_ACTIVE_ORDERS"));

    const response = await DELETE(deleteRequest(), ctx());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("PRODUCT_HAS_ACTIVE_ORDERS");
    expect(data.error).toContain("pedidos activos");
  });

  it("producto inexistente: responde 404", async () => {
    retirarProductoAdmin.mockRejectedValue(new Error("Producto no encontrado."));

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(404);
  });
});
