import { describe, expect, it, vi, beforeEach } from "vitest";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));

const { activarOfertaSemana, desactivarOfertaSemana } = vi.hoisted(() => ({
  activarOfertaSemana: vi.fn(async () => ({ producto: { id: "prod-1", esOfertaSemana: true } })),
  desactivarOfertaSemana: vi.fn(async () => ({ producto: { id: "prod-1", esOfertaSemana: false } }))
}));

vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({
    activarOfertaSemana,
    desactivarOfertaSemana
  })
}));

import { GET as ofertasGet, POST as ofertasPost } from "@/app/api/admin/ofertas/route";

function makeRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("GET /api/admin/ofertas", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
  });

  it("rechaza con 401 sin sesion", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await ofertasGet();
    expect(response.status).toBe(401);
  });

  it("con sesion valida, retorna 200", async () => {
    const response = await ofertasGet();
    expect(response.status).toBe(200);
  });
});

describe("POST /api/admin/ofertas", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    activarOfertaSemana.mockClear();
    desactivarOfertaSemana.mockClear();
  });

  it("rechaza con 401 sin sesion", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await ofertasPost(
      makeRequest("http://localhost/api/admin/ofertas", { action: "activar", productId: "prod-1" })
    );
    expect(response.status).toBe(401);
    expect(activarOfertaSemana).not.toHaveBeenCalled();
  });

  it("activar llama a activarOfertaSemana con el productId y precioAnterior enviados", async () => {
    const response = await ofertasPost(
      makeRequest("http://localhost/api/admin/ofertas", {
        action: "activar",
        productId: "prod-1",
        precioAnterior: 65000
      })
    );
    expect(response.status).toBe(200);
    expect(activarOfertaSemana).toHaveBeenCalledWith("prod-1", 65000);
  });

  it("activar sin productId se rechaza con 400", async () => {
    const response = await ofertasPost(makeRequest("http://localhost/api/admin/ofertas", { action: "activar" }));
    expect(response.status).toBe(400);
    expect(activarOfertaSemana).not.toHaveBeenCalled();
  });

  it("desactivar llama a desactivarOfertaSemana", async () => {
    const response = await ofertasPost(
      makeRequest("http://localhost/api/admin/ofertas", { action: "desactivar", productId: "prod-1" })
    );
    expect(response.status).toBe(200);
    expect(desactivarOfertaSemana).toHaveBeenCalledWith("prod-1");
  });

  it("propaga el error del servicio (ej. limite alcanzado) como 400", async () => {
    activarOfertaSemana.mockRejectedValueOnce(new Error("Ya hay 10 productos en Ofertas de la semana."));
    const response = await ofertasPost(
      makeRequest("http://localhost/api/admin/ofertas", { action: "activar", productId: "prod-1" })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/10 productos/);
  });
});
