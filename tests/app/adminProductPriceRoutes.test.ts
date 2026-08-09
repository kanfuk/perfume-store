import { describe, expect, it, vi, beforeEach } from "vitest";

const { isAdminAuthenticated, getAuthenticatedAdmin } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true),
  getAuthenticatedAdmin: vi.fn(async () => ({ userId: "auth-1", profileId: "admin-1", rol: "ADMIN" }))
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated, getAuthenticatedAdmin }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAction: vi.fn(), requestAuditId: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));

const {
  fijarPrecioManualProducto,
  volverPrecioAutomaticoProducto,
  actualizarCostoProducto,
  previsualizarAjusteMasivoPrecio,
  confirmarAjusteMasivoPrecio
} = vi.hoisted(() => ({
  fijarPrecioManualProducto: vi.fn(async () => ({ id: "prod-1", precioVenta: 72000, modoPrecio: "MANUAL" })),
  volverPrecioAutomaticoProducto: vi.fn(async () => ({ id: "prod-1", precioVenta: 60750, modoPrecio: "AUTO" })),
  actualizarCostoProducto: vi.fn(async () => ({
    id: "prod-1",
    costoUnitario: 50000,
    precioVenta: 67500,
    modoPrecio: "AUTO"
  })),
  previsualizarAjusteMasivoPrecio: vi.fn(async () => ({
    operation: { type: "ajuste-porcentaje", porcentaje: 10 },
    productos: [{ id: "prod-1", sku: "SML-A", nombre: "La Bomba", precioAnterior: 65000, precioNuevo: 71500, diferencia: 6500 }],
    erroresGlobales: [] as string[]
  })),
  confirmarAjusteMasivoPrecio: vi.fn(async () => ({ actualizados: 1 }))
}));

vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({
    fijarPrecioManualProducto,
    volverPrecioAutomaticoProducto,
    actualizarCostoProducto,
    previsualizarAjusteMasivoPrecio,
    confirmarAjusteMasivoPrecio
  })
}));

import { PATCH } from "@/app/api/admin/products/[productId]/price/route";
import { POST as bulkPricePost } from "@/app/api/admin/products/bulk-price/route";

function makeRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("PATCH /api/admin/products/[productId]/price", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    fijarPrecioManualProducto.mockClear();
    volverPrecioAutomaticoProducto.mockClear();
    actualizarCostoProducto.mockClear();
  });

  it("rechaza con 401 cuando el admin no esta autenticado", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await PATCH(
      makeRequest("http://localhost:3000/api/admin/products/prod-1/price", { precioVenta: 72000 }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(401);
    expect(fijarPrecioManualProducto).not.toHaveBeenCalled();
  });

  it("modo manual (por defecto) llama a fijarPrecioManualProducto", async () => {
    const response = await PATCH(
      makeRequest("http://localhost:3000/api/admin/products/prod-1/price", { precioVenta: 72000 }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.modoPrecio).toBe("MANUAL");
    expect(fijarPrecioManualProducto).toHaveBeenCalledWith("prod-1", 72000);
  });

  it("modo auto llama a volverPrecioAutomaticoProducto", async () => {
    const response = await PATCH(
      makeRequest("http://localhost:3000/api/admin/products/prod-1/price", {
        mode: "auto",
        recargoPorcentaje: 35
      }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.modoPrecio).toBe("AUTO");
    expect(volverPrecioAutomaticoProducto).toHaveBeenCalledWith("prod-1", 35);
  });

  it("propaga el error de validacion del servicio como 400", async () => {
    fijarPrecioManualProducto.mockRejectedValueOnce(new Error("El precio debe ser mayor que 0."));
    const response = await PATCH(
      makeRequest("http://localhost:3000/api/admin/products/prod-1/price", { precioVenta: -1 }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/admin/products/bulk-price", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    previsualizarAjusteMasivoPrecio.mockClear();
    confirmarAjusteMasivoPrecio.mockClear();
  });

  it("rechaza con 401 cuando el admin no esta autenticado", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "ajuste-porcentaje", porcentaje: 10 }
      })
    );
    expect(response.status).toBe(401);
    expect(previsualizarAjusteMasivoPrecio).not.toHaveBeenCalled();
  });

  it("rechaza cuando no hay productos seleccionados", async () => {
    const response = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "preview",
        productIds: [],
        operation: { type: "ajuste-porcentaje", porcentaje: 10 }
      })
    );
    expect(response.status).toBe(400);
  });

  it("preview devuelve productos y un previewHash", async () => {
    const response = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "ajuste-porcentaje", porcentaje: 10 }
      })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.preview.productos).toHaveLength(1);
    expect(typeof data.previewHash).toBe("string");
    expect(confirmarAjusteMasivoPrecio).not.toHaveBeenCalled();
  });

  it("confirm con hash correcto ejecuta confirmarAjusteMasivoPrecio", async () => {
    const previewResponse = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "ajuste-porcentaje", porcentaje: 10 }
      })
    );
    const { previewHash } = await previewResponse.json();

    const response = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "confirm",
        productIds: ["prod-1"],
        operation: { type: "ajuste-porcentaje", porcentaje: 10 },
        previewHash
      })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.actualizados).toBe(1);
    expect(confirmarAjusteMasivoPrecio).toHaveBeenCalledTimes(1);
  });

  it("confirm con hash incorrecto (seleccion/operacion cambiada) se rechaza con 409", async () => {
    const response = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "confirm",
        productIds: ["prod-1"],
        operation: { type: "ajuste-porcentaje", porcentaje: 10 },
        previewHash: "hash-invalido"
      })
    );
    expect(response.status).toBe(409);
    expect(confirmarAjusteMasivoPrecio).not.toHaveBeenCalled();
  });

  it("confirm se bloquea si el preview trae errores globales, aun con hash valido", async () => {
    previsualizarAjusteMasivoPrecio.mockResolvedValueOnce({
      operation: { type: "recargo", porcentaje: 400 },
      productos: [],
      erroresGlobales: ["El recargo debe estar entre 0 y 300%."]
    });
    const previewResponse = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "recargo", porcentaje: 400 }
      })
    );
    const { previewHash } = await previewResponse.json();

    previsualizarAjusteMasivoPrecio.mockResolvedValueOnce({
      operation: { type: "recargo", porcentaje: 400 },
      productos: [],
      erroresGlobales: ["El recargo debe estar entre 0 y 300%."]
    });
    const response = await bulkPricePost(
      makeRequest("http://localhost:3000/api/admin/products/bulk-price", {
        action: "confirm",
        productIds: ["prod-1"],
        operation: { type: "recargo", porcentaje: 400 },
        previewHash
      })
    );
    expect(response.status).toBe(400);
    expect(confirmarAjusteMasivoPrecio).not.toHaveBeenCalled();
  });
});
