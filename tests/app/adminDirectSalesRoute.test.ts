import { beforeEach, describe, expect, it, vi } from "vitest";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));
const { validateTrustedOrigin, validateJsonRequest } = vi.hoisted(() => ({
  validateTrustedOrigin: vi.fn((): Response | null => null),
  validateJsonRequest: vi.fn((): Response | null => null)
}));
const { crearVentaDirecta } = vi.hoisted(() => ({
  crearVentaDirecta: vi.fn()
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));
vi.mock("@/lib/http-security", () => ({ validateTrustedOrigin, validateJsonRequest }));
vi.mock("@/services/pedidoService", () => ({
  createPedidoService: () => ({ crearVentaDirecta })
}));

import { POST } from "@/app/api/admin/direct-sales/route";

const RESULT = {
  pedidoId: "pedido-1",
  codigo: "PERF-2026-000001",
  clienteId: "cliente-1",
  subtotal: 10000,
  costoDespacho: 0,
  total: 10000,
  estadoPedido: "ENTREGADO",
  estadoPago: "PAGADO",
  metodoDespacho: "STARKEN_POR_PAGAR",
  origenPedido: "ADMIN_DIRECTO",
  items: []
};

function validBody() {
  return {
    items: [{ productoId: "perfume-1", cantidad: 1 }],
    estadoPago: "PAGADO",
    formaPago: "EFECTIVO",
    clienteModo: "ocasional",
    idempotencyKey: "test-idempotency-key"
  };
}

function request(body: unknown, raw = false) {
  return new Request("http://localhost/api/admin/direct-sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: raw ? String(body) : JSON.stringify(body)
  });
}

describe("POST /api/admin/direct-sales (Fase 3B.2)", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    isAdminAuthenticated.mockResolvedValue(true);
    validateTrustedOrigin.mockClear();
    validateTrustedOrigin.mockReturnValue(null);
    validateJsonRequest.mockClear();
    validateJsonRequest.mockReturnValue(null);
    crearVentaDirecta.mockReset();
    crearVentaDirecta.mockResolvedValue(RESULT);
  });

  it("rechaza con 401 sin sesion, sin llamar al servicio", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await POST(request(validBody()));
    expect(response.status).toBe(401);
    expect(crearVentaDirecta).not.toHaveBeenCalled();
  });

  it("rechaza con el error de origen confiable si el chequeo falla", async () => {
    const originResponse = new Response(JSON.stringify({ error: "Origen no confiable." }), {
      status: 403
    });
    validateTrustedOrigin.mockReturnValueOnce(originResponse);
    const response = await POST(request(validBody()));
    expect(response.status).toBe(403);
    expect(crearVentaDirecta).not.toHaveBeenCalled();
  });

  it("rechaza JSON invalido", async () => {
    const response = await POST(request("no-es-json", true));
    expect(response.status).toBe(400);
    expect(crearVentaDirecta).not.toHaveBeenCalled();
  });

  it("rechaza claves desconocidas, incluido cualquier precio o total enviado por el cliente", async () => {
    const response = await POST(request({ ...validBody(), total: 1, precioVenta: 1 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/Campos no permitidos/);
    expect(body.error).toMatch(/total/);
    expect(crearVentaDirecta).not.toHaveBeenCalled();
  });

  it("exige idempotencyKey como string", async () => {
    const withoutKey: Record<string, unknown> = validBody();
    delete withoutKey.idempotencyKey;
    const response = await POST(request(withoutKey));
    expect(response.status).toBe(400);
    expect(crearVentaDirecta).not.toHaveBeenCalled();
  });

  it("con un cuerpo valido, delega en pedidoService.crearVentaDirecta y devuelve 201", async () => {
    const response = await POST(request(validBody()));
    expect(response.status).toBe(201);
    expect(crearVentaDirecta).toHaveBeenCalledWith(validBody());
    const body = await response.json();
    expect(body).toEqual(RESULT);
  });

  it("mapea un error de la RPC (stock insuficiente) a un status controlado, sin exponer detalle de Supabase", async () => {
    const { PerfumeOrderError } = await import("@/lib/perfumeOrderErrors");
    crearVentaDirecta.mockRejectedValueOnce(
      new PerfumeOrderError("PF005", "Stock insuficiente para Perfume floral.")
    );
    const response = await POST(request(validBody()));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("Stock insuficiente para Perfume floral.");
  });
});
