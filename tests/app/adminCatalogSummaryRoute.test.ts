import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CatalogSummary } from "@/lib/catalog-summary";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));

const FAKE_SUMMARY: CatalogSummary = {
  total: 101,
  activos: 90,
  pausados: 11,
  disponibles: 80,
  sinStock: 15,
  incompletos: 4,
  preciosAuto: 89,
  preciosManual: 12,
  top12Asignados: 9,
  top12Pendientes: 3
};

const { obtenerResumenCatalogo } = vi.hoisted(() => ({
  obtenerResumenCatalogo: vi.fn(async () => FAKE_SUMMARY)
}));

vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({ obtenerResumenCatalogo })
}));

import { GET } from "@/app/api/admin/catalog-summary/route";

describe("GET /api/admin/catalog-summary (Fase 3A)", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    obtenerResumenCatalogo.mockClear();
  });

  it("rechaza con 401 sin sesion, sin llamar al servicio", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(obtenerResumenCatalogo).not.toHaveBeenCalled();
  });

  it("con sesion valida, retorna 200 con el resumen (solo conteos)", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(FAKE_SUMMARY);
  });

  it("nunca retorna listas de productos, clientes ni pedidos", async () => {
    const response = await GET();
    const body = await response.json();
    expect(Array.isArray(body)).toBe(false);
    expect(body.products).toBeUndefined();
    expect(body.clientes).toBeUndefined();
    expect(body.pedidos).toBeUndefined();
  });

  it("propaga un error del servicio como 500 controlado (nunca una excepcion sin manejar)", async () => {
    obtenerResumenCatalogo.mockRejectedValueOnce(new Error("Fallo de base de datos"));
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/Fallo de base de datos/);
  });
});
