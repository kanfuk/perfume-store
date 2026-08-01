import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(), qaPreview: vi.fn(), qaCleanup: vi.fn(), catalogBackupFile: vi.fn(),
  catalogResetPreview: vi.fn(), catalogReset: vi.fn(), storageOrphans: vi.fn(), cleanupStorageOrphans: vi.fn()
}));

vi.mock("@/lib/admin-auth", () => ({ getAuthenticatedAdmin: mocks.getAdmin }));
vi.mock("@/services/mvpMaintenanceService", () => ({ createMvpMaintenanceService: () => mocks }));

import { GET as qaPreviewRoute } from "@/app/api/admin/maintenance/qa-preview/route";
import { POST as qaCleanupRoute } from "@/app/api/admin/maintenance/qa-cleanup/route";
import { POST as resetRoute } from "@/app/api/admin/maintenance/catalog-reset/route";
import { POST as orphanCleanupRoute } from "@/app/api/admin/maintenance/storage-orphans/cleanup/route";

const admin = { userId: "admin-1", email: "admin@example.test", nombre: "Admin", rol: "ADMIN" };
const key = "maintenance:test:1234567890";

function request(path: string, body?: unknown, origin = true) {
  return new Request(`http://localhost${path}`, body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: "http://localhost" } : {}) },
    body: JSON.stringify(body)
  });
}

describe("rutas de mantenimiento MVP V2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdmin.mockResolvedValue(admin);
    mocks.qaPreview.mockResolvedValue({ orders: { deletable: 0 } });
    mocks.qaCleanup.mockResolvedValue({ ordersDeleted: 0 });
    mocks.catalogReset.mockResolvedValue({ productsDeleted: 0 });
    mocks.cleanupStorageOrphans.mockResolvedValue({ deleted: 0 });
  });

  it("protege previews y responde no-store", async () => {
    mocks.getAdmin.mockResolvedValue(null);
    expect((await qaPreviewRoute(request("/api/admin/maintenance/qa-preview"))).status).toBe(401);
    mocks.getAdmin.mockResolvedValue(admin);
    const response = await qaPreviewRoute(request("/api/admin/maintenance/qa-preview"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("exige origen, frase, clave y campos exactos para QA", async () => {
    const valid = { confirmation: "ELIMINAR DATOS DE PRUEBA", idempotencyKey: key };
    expect((await qaCleanupRoute(request("/api/admin/maintenance/qa-cleanup", valid, false))).status).toBe(403);
    expect((await qaCleanupRoute(request("/api/admin/maintenance/qa-cleanup", { ...valid, ids: ["x"] }))).status).toBe(400);
    expect((await qaCleanupRoute(request("/api/admin/maintenance/qa-cleanup", { ...valid, confirmation: "eliminar" }))).status).toBe(400);
    const response = await qaCleanupRoute(request("/api/admin/maintenance/qa-cleanup", valid));
    expect(response.status).toBe(200);
    expect(mocks.qaCleanup).toHaveBeenCalledWith(key);
  });

  it("requiere respaldo y fingerprint vigente para reset", async () => {
    const base = { confirmation: "REINICIAR CATALOGO SMELLME", backupConfirmed: false, idempotencyKey: key, expectedFingerprint: "a".repeat(32) };
    expect((await resetRoute(request("/api/admin/maintenance/catalog-reset", base))).status).toBe(400);
    const response = await resetRoute(request("/api/admin/maintenance/catalog-reset", { ...base, backupConfirmed: true }));
    expect(response.status).toBe(200);
    expect(mocks.catalogReset).toHaveBeenCalledWith(key, "a".repeat(32));
  });

  it("no acepta listas de rutas para limpieza de huérfanos", async () => {
    const body = { confirmation: "ELIMINAR ARCHIVOS HUERFANOS", idempotencyKey: key };
    expect((await orphanCleanupRoute(request("/api/admin/maintenance/storage-orphans/cleanup", { ...body, paths: ["products/x.webp"] }))).status).toBe(400);
    expect((await orphanCleanupRoute(request("/api/admin/maintenance/storage-orphans/cleanup", body))).status).toBe(200);
    expect(mocks.cleanupStorageOrphans).toHaveBeenCalledWith(key);
  });
});
