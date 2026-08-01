import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductRecord } from "@/lib/types";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));

const FAKE_PRODUCTS: ProductRecord[] = [
  {
    id: "perfume-1",
    sku: "SKU-1",
    nombre: "Perfume floral",
    marca: "Marca A",
    contenido: "50ML",
    precioVenta: 10000,
    stockActual: 5,
    activo: true,
    esTop: false
  }
];

const { obtenerCatalogoVentaDirecta } = vi.hoisted(() => ({
  obtenerCatalogoVentaDirecta: vi.fn(async () => FAKE_PRODUCTS)
}));

vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({ obtenerCatalogoVentaDirecta })
}));

import { GET } from "@/app/api/admin/products/search/route";

describe("GET /api/admin/products/search (Fase 3B.2)", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    obtenerCatalogoVentaDirecta.mockClear();
  });

  it("rechaza con 401 sin sesion, sin llamar al servicio", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(obtenerCatalogoVentaDirecta).not.toHaveBeenCalled();
  });

  it("con sesion valida, retorna 200 con el catalogo liviano sin cache", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toMatch(/no-store/);
    const body = await response.json();
    expect(body.products).toEqual(FAKE_PRODUCTS);
  });

  it("nunca expone costoUnitario ni utilidadUnitaria en la respuesta", async () => {
    const response = await GET();
    const body = await response.json();
    for (const product of body.products) {
      expect(product).not.toHaveProperty("costoUnitario");
      expect(product).not.toHaveProperty("utilidadUnitaria");
      expect(product).not.toHaveProperty("imageUrl");
      expect(product).not.toHaveProperty("descripcion");
    }
  });

  it("propaga un error del servicio como 500 controlado", async () => {
    obtenerCatalogoVentaDirecta.mockRejectedValueOnce(new Error("Fallo de base de datos"));
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/Fallo de base de datos/);
  });
});
