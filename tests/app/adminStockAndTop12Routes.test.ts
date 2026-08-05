import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BulkStockPreview } from "@/services/productoService";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));

const {
  ajustarStockRapido,
  establecerStockRapido,
  agotarProductoRapido,
  previsualizarAjusteMasivoStock,
  confirmarAjusteMasivoStock,
  asignarImagenProducto,
  obtenerEstadoTop12,
  vincularProductoTop12,
  desvincularProductoTop12
} = vi.hoisted(() => ({
  ajustarStockRapido: vi.fn(async () => ({ id: "prod-1", stockActual: 8, activo: true })),
  establecerStockRapido: vi.fn(async () => ({ id: "prod-1", stockActual: 20, activo: true })),
  agotarProductoRapido: vi.fn(async () => ({ id: "prod-1", stockActual: 2, activo: true })),
  previsualizarAjusteMasivoStock: vi.fn(
    async (): Promise<BulkStockPreview> => ({
      operation: { type: "sumar", cantidad: 1 },
      totalSeleccionados: 1,
      productos: [
        {
          id: "prod-1",
          sku: "SML-A",
          nombre: "La Bomba",
          stockAnterior: 5,
          stockNuevo: 6,
          activoAnterior: true,
          activoNuevo: true,
          status: "CAMBIA"
        }
      ],
      erroresGlobales: [] as string[]
    })
  ),
  confirmarAjusteMasivoStock: vi.fn(async () => ({ actualizados: 1, sinCambios: 0, bloqueados: 0, total: 1 })),
  asignarImagenProducto: vi.fn(async () => ({ id: "prod-1", imageUrl: "https://cdn.example.com/x.webp" })),
  obtenerEstadoTop12: vi.fn(async () =>
    Array.from({ length: 15 }, (_, i) => {
      const rank = i + 1;
      if (rank === 3) {
        return { rank, producto: { id: "prod-1", nombre: "La Bomba", imageUrl: "/images/mi-propia-foto.webp" } };
      }
      return { rank, producto: null };
    })
  ),
  vincularProductoTop12: vi.fn(async () => ({ rank: 3, producto: { id: "prod-1" } })),
  desvincularProductoTop12: vi.fn(async () => ({ rank: 3, producto: null }))
}));

vi.mock("@/services/productoService", () => ({
  // Constante real (no una funcion del servicio): se declara aqui tal cual
  // porque este mock reemplaza el modulo completo y la ruta bulk-stock la
  // usa para validar la lista blanca de acciones permitidas.
  BULK_STOCK_OPERATION_TYPES: ["sumar", "restar", "establecer", "activar", "pausar", "disponibleUno", "agotar"],
  createProductoService: () => ({
    ajustarStockRapido,
    establecerStockRapido,
    agotarProductoRapido,
    previsualizarAjusteMasivoStock,
    confirmarAjusteMasivoStock,
    asignarImagenProducto,
    obtenerEstadoTop12,
    vincularProductoTop12,
    desvincularProductoTop12
  })
}));

import { PATCH as stockPatch } from "@/app/api/admin/products/[productId]/stock/route";
import { POST as bulkStockPost } from "@/app/api/admin/products/bulk-stock/route";
import { PATCH as imagePatch } from "@/app/api/admin/products/[productId]/image/route";
import { GET as top12Get, POST as top12Post } from "@/app/api/admin/top12/route";

function makeRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("PATCH /api/admin/products/[productId]/stock", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    ajustarStockRapido.mockClear();
    establecerStockRapido.mockClear();
    agotarProductoRapido.mockClear();
  });

  it("rechaza con 401 sin sesion", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await stockPatch(makeRequest("http://localhost/api/admin/products/prod-1/stock", { delta: 1 }), {
      params: Promise.resolve({ productId: "prod-1" })
    });
    expect(response.status).toBe(401);
    expect(ajustarStockRapido).not.toHaveBeenCalled();
  });

  it("modo delta (por defecto) llama a ajustarStockRapido", async () => {
    const response = await stockPatch(makeRequest("http://localhost/api/admin/products/prod-1/stock", { delta: 1 }), {
      params: Promise.resolve({ productId: "prod-1" })
    });
    expect(response.status).toBe(200);
    expect(ajustarStockRapido).toHaveBeenCalledWith("prod-1", 1);
  });

  it("modo set llama a establecerStockRapido", async () => {
    const response = await stockPatch(
      makeRequest("http://localhost/api/admin/products/prod-1/stock", { mode: "set", valor: 20 }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(200);
    expect(establecerStockRapido).toHaveBeenCalledWith("prod-1", 20);
  });

  it("modo agotar llama a agotarProductoRapido", async () => {
    const response = await stockPatch(
      makeRequest("http://localhost/api/admin/products/prod-1/stock", { mode: "agotar" }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(200);
    expect(agotarProductoRapido).toHaveBeenCalledWith("prod-1");
  });

  it("propaga el error de validacion del servicio como 400", async () => {
    ajustarStockRapido.mockRejectedValueOnce(new Error("El stock no puede ser negativo."));
    const response = await stockPatch(
      makeRequest("http://localhost/api/admin/products/prod-1/stock", { delta: -100 }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/admin/products/bulk-stock", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    previsualizarAjusteMasivoStock.mockClear();
    confirmarAjusteMasivoStock.mockClear();
  });

  it("rechaza con 401 sin sesion", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "sumar", cantidad: 1 }
      })
    );
    expect(response.status).toBe(401);
    expect(previsualizarAjusteMasivoStock).not.toHaveBeenCalled();
  });

  it("preview devuelve productos y previewHash", async () => {
    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "sumar", cantidad: 1 }
      })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.preview.productos).toHaveLength(1);
    expect(typeof data.previewHash).toBe("string");
    expect(confirmarAjusteMasivoStock).not.toHaveBeenCalled();
  });

  it("confirm con hash correcto ejecuta confirmarAjusteMasivoStock", async () => {
    const previewResponse = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "sumar", cantidad: 1 }
      })
    );
    const { previewHash } = await previewResponse.json();

    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "confirm",
        productIds: ["prod-1"],
        operation: { type: "sumar", cantidad: 1 },
        previewHash
      })
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.actualizados).toBe(1);
  });

  it("confirm con hash invalido se rechaza con 409", async () => {
    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "confirm",
        productIds: ["prod-1"],
        operation: { type: "sumar", cantidad: 1 },
        previewHash: "hash-invalido"
      })
    );
    expect(response.status).toBe(409);
    expect(confirmarAjusteMasivoStock).not.toHaveBeenCalled();
  });

  it("rechaza arreglo vacio con 400", async () => {
    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: [],
        operation: { type: "sumar", cantidad: 1 }
      })
    );
    expect(response.status).toBe(400);
    expect(previsualizarAjusteMasivoStock).not.toHaveBeenCalled();
  });

  it("rechaza accion desconocida con 400 (Fase 2B.9)", async () => {
    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "volar" }
      })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/no es válida/i);
    expect(previsualizarAjusteMasivoStock).not.toHaveBeenCalled();
  });

  it("rechaza mas de 500 productIds con 400 (Fase 2B.9)", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `p${i}`);
    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: ids,
        operation: { type: "activar" }
      })
    );
    expect(response.status).toBe(400);
    expect(previsualizarAjusteMasivoStock).not.toHaveBeenCalled();
  });

  it("deduplica IDs repetidos antes de procesar en vez de rechazarlos (Fase 2B.9)", async () => {
    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: ["prod-1", "prod-1", "prod-1"],
        operation: { type: "sumar", cantidad: 1 }
      })
    );
    expect(response.status).toBe(200);
    expect(previsualizarAjusteMasivoStock).toHaveBeenCalledWith(["prod-1"], { type: "sumar", cantidad: 1 });
  });

  it("acepta las nuevas acciones activar/pausar/disponibleUno/agotar (Fase 2B.9)", async () => {
    for (const type of ["activar", "pausar", "disponibleUno", "agotar"] as const) {
      const response = await bulkStockPost(
        makeRequest("http://localhost/api/admin/products/bulk-stock", {
          action: "preview",
          productIds: ["prod-1"],
          operation: { type }
        })
      );
      expect(response.status).toBe(200);
    }
  });

  it("confirm se bloquea con 400 cuando TODOS los productos del preview quedan bloqueados (Fase 2B.9)", async () => {
    previsualizarAjusteMasivoStock.mockResolvedValueOnce({
      operation: { type: "restar", cantidad: 5 },
      totalSeleccionados: 1,
      productos: [
        {
          id: "prod-1",
          sku: "SML-A",
          nombre: "La Bomba",
          stockAnterior: 2,
          stockNuevo: 2,
          activoAnterior: true,
          activoNuevo: true,
          status: "BLOQUEADO",
          motivo: "Restar dejaría el stock por debajo del reservado."
        }
      ],
      erroresGlobales: []
    });
    const previewResponse = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "preview",
        productIds: ["prod-1"],
        operation: { type: "restar", cantidad: 5 }
      })
    );
    const { previewHash } = await previewResponse.json();

    previsualizarAjusteMasivoStock.mockResolvedValueOnce({
      operation: { type: "restar", cantidad: 5 },
      totalSeleccionados: 1,
      productos: [
        {
          id: "prod-1",
          sku: "SML-A",
          nombre: "La Bomba",
          stockAnterior: 2,
          stockNuevo: 2,
          activoAnterior: true,
          activoNuevo: true,
          status: "BLOQUEADO",
          motivo: "Restar dejaría el stock por debajo del reservado."
        }
      ],
      erroresGlobales: []
    });

    const response = await bulkStockPost(
      makeRequest("http://localhost/api/admin/products/bulk-stock", {
        action: "confirm",
        productIds: ["prod-1"],
        operation: { type: "restar", cantidad: 5 },
        previewHash
      })
    );
    expect(response.status).toBe(400);
    expect(confirmarAjusteMasivoStock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/products/[productId]/image", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    asignarImagenProducto.mockClear();
  });

  it("rechaza con 401 sin sesion", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await imagePatch(
      makeRequest("http://localhost/api/admin/products/prod-1/image", { imageUrl: "https://x.com/a.webp" }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(401);
    expect(asignarImagenProducto).not.toHaveBeenCalled();
  });

  it("llama a asignarImagenProducto con la url recibida", async () => {
    const response = await imagePatch(
      makeRequest("http://localhost/api/admin/products/prod-1/image", { imageUrl: "https://cdn.example.com/x.webp" }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(200);
    expect(asignarImagenProducto).toHaveBeenCalledWith("prod-1", "https://cdn.example.com/x.webp");
  });

  it("propaga error de validacion como 400", async () => {
    asignarImagenProducto.mockRejectedValueOnce(new Error("La imagen debe ser una URL https"));
    const response = await imagePatch(
      makeRequest("http://localhost/api/admin/products/prod-1/image", { imageUrl: "javascript:alert(1)" }),
      { params: Promise.resolve({ productId: "prod-1" }) }
    );
    expect(response.status).toBe(400);
  });
});

describe("GET/POST /api/admin/top12", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    obtenerEstadoTop12.mockClear();
    vincularProductoTop12.mockClear();
    desvincularProductoTop12.mockClear();
  });

  it("GET rechaza con 401 sin sesion", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await top12Get();
    expect(response.status).toBe(401);
  });

  it("GET devuelve 15 posiciones y la imagen real del producto vinculado, nunca una foto historica por rank", async () => {
    const response = await top12Get();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.slots).toHaveLength(15);
    expect(data.slots[2].rank).toBe(3);
    expect(data.slots[2].imageUrl).toBe("/images/mi-propia-foto.webp");
    expect(data.slots[0].producto).toBeNull();
    expect(data.slots[0].imageUrl).toBeNull();
  });

  it("POST rechaza con 401 sin sesion", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await top12Post(
      makeRequest("http://localhost/api/admin/top12", { action: "vincular", rank: 3, productId: "prod-1" })
    );
    expect(response.status).toBe(401);
    expect(vincularProductoTop12).not.toHaveBeenCalled();
  });

  it("POST vincular ignora cualquier imageUrl enviada por el cliente (la imagen siempre es la del producto)", async () => {
    const response = await top12Post(
      makeRequest("http://localhost/api/admin/top12", {
        action: "vincular",
        rank: 3,
        productId: "prod-1",
        imageUrl: "https://atacante.com/fake.webp"
      })
    );
    expect(response.status).toBe(200);
    expect(vincularProductoTop12).toHaveBeenCalledWith(3, "prod-1");
  });

  it("POST desvincular llama a desvincularProductoTop12", async () => {
    const response = await top12Post(
      makeRequest("http://localhost/api/admin/top12", { action: "desvincular", rank: 3 })
    );
    expect(response.status).toBe(200);
    expect(desvincularProductoTop12).toHaveBeenCalledWith(3);
  });

  it("POST vincular sin productId se rechaza con 400", async () => {
    const response = await top12Post(makeRequest("http://localhost/api/admin/top12", { action: "vincular", rank: 3 }));
    expect(response.status).toBe(400);
    expect(vincularProductoTop12).not.toHaveBeenCalled();
  });
});
