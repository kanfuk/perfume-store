import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAdmin } = vi.hoisted(() => ({
  getAuthenticatedAdmin: vi.fn()
}));
const { obtenerEstadoConfiguracionPago } = vi.hoisted(() => ({
  obtenerEstadoConfiguracionPago: vi.fn()
}));
const {
  agendarPedido,
  marcarPedidoPagado,
  cancelarPedido,
  obtenerPedidoAdminPorId,
  iniciarPreparacionPedido,
  despacharPedido,
  entregarPedido,
  registrarAbonoFiado,
  marcarPedidoVisto
} = vi.hoisted(() => ({
  agendarPedido: vi.fn(),
  marcarPedidoPagado: vi.fn(),
  cancelarPedido: vi.fn(),
  obtenerPedidoAdminPorId: vi.fn(),
  iniciarPreparacionPedido: vi.fn(),
  despacharPedido: vi.fn(),
  entregarPedido: vi.fn(),
  registrarAbonoFiado: vi.fn(),
  marcarPedidoVisto: vi.fn()
}));

vi.mock("@/lib/admin-auth", () => ({ getAuthenticatedAdmin }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));
vi.mock("@/services/businessSettingsService", () => ({
  createBusinessSettingsService: () => ({
    obtenerEstadoConfiguracionPago
  })
}));
vi.mock("@/services/pedidoService", () => ({
  createPedidoService: () => ({
    agendarPedido,
    marcarPedidoPagado,
    cancelarPedido,
    obtenerPedidoAdminPorId,
    iniciarPreparacionPedido,
    despacharPedido,
    entregarPedido,
    registrarAbonoFiado,
    marcarPedidoVisto
  })
}));

import { PATCH } from "@/app/api/admin/orders/[pedidoId]/route";

const settings = {
  banco: "BANCOESTADO",
  tipoCuenta: "CUENTA_VISTA",
  titularCuenta: "Smellme SpA",
  rutTitular: "12345678-5",
  numeroCuenta: "001234",
  correo: "pagos@smellme.cl"
};

const order = {
  id: "pedido-1",
  codigo: "PS-0001",
  clienteNombre: "Cliente de prueba",
  clienteTelefono: "+56911111111",
  clienteRegion: "Metropolitana",
  clienteComuna: "Santiago",
  clienteDireccion: "Dirección de prueba",
  items: [
    {
      productoId: "prod-1",
      productoNombre: "Perfume de prueba",
      cantidad: 1,
      precioUnitario: 10000,
      subtotal: 10000
    }
  ],
  total: 14000,
  costoDespacho: 4000,
  estadoPedido: "AGENDADO",
  estadoPago: "SIN_PAGO"
};

function request(body: unknown, raw = false) {
  return new Request("http://localhost/api/admin/orders/pedido-1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost"
    },
    body: raw ? String(body) : JSON.stringify(body)
  });
}

const context = { params: Promise.resolve({ pedidoId: "pedido-1" }) };

describe("PATCH operaciones administrativas de pedidos", () => {
  beforeEach(() => {
    getAuthenticatedAdmin.mockReset();
    getAuthenticatedAdmin.mockResolvedValue({ userId: "admin-1" });
    obtenerEstadoConfiguracionPago.mockReset();
    obtenerEstadoConfiguracionPago.mockResolvedValue({
      settings,
      completa: true
    });
    for (const mock of [
      agendarPedido,
      marcarPedidoPagado,
      cancelarPedido,
      obtenerPedidoAdminPorId,
      iniciarPreparacionPedido,
      despacharPedido,
      entregarPedido,
      registrarAbonoFiado,
      marcarPedidoVisto
    ]) {
      mock.mockReset();
      mock.mockResolvedValue(undefined);
    }
    obtenerPedidoAdminPorId.mockResolvedValue(order);
  });

  it("sin sesion devuelve 401 y no muta", async () => {
    getAuthenticatedAdmin.mockResolvedValueOnce(null);
    const response = await PATCH(request({ action: "agendar" }), context);
    expect(response.status).toBe(401);
    expect(agendarPedido).not.toHaveBeenCalled();
  });

  it("configuracion incompleta bloquea Atender antes de mutar", async () => {
    obtenerEstadoConfiguracionPago.mockResolvedValueOnce({
      settings: { ...settings, banco: "" },
      completa: false
    });
    const response = await PATCH(request({ action: "agendar" }), context);
    const payload = await response.json();
    expect(response.status).toBe(422);
    expect(payload.code).toBe("CONFIG_INCOMPLETA");
    expect(payload.configuracionUrl).toContain("/admin/configuracion");
    expect(agendarPedido).not.toHaveBeenCalled();
    expect(obtenerPedidoAdminPorId).not.toHaveBeenCalled();
  });

  it("configuracion completa permite Atender y devuelve pedido + mensaje", async () => {
    const response = await PATCH(request({ action: "agendar" }), context);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(agendarPedido).toHaveBeenCalledWith("pedido-1");
    expect(payload.pedido.id).toBe("pedido-1");
    expect(payload.whatsapp.message).toContain("001234");
  });

  it("Reenviar genera el mensaje sin mutar estado, pago o stock", async () => {
    const response = await PATCH(
      request({ action: "reenviar-transferencia" }),
      context
    );
    expect(response.status).toBe(200);
    expect(obtenerPedidoAdminPorId).toHaveBeenCalledWith("pedido-1");
    expect(agendarPedido).not.toHaveBeenCalled();
    expect(marcarPedidoPagado).not.toHaveBeenCalled();
    expect(cancelarPedido).not.toHaveBeenCalled();
  });

  it("Coordinar entrega es repetible y no muta el pedido", async () => {
    obtenerPedidoAdminPorId.mockResolvedValue({
      ...order,
      estadoPedido: "PAGADO",
      estadoPago: "PAGADO"
    });
    const first = await PATCH(request({ action: "coordinar-entrega" }), context);
    const second = await PATCH(request({ action: "coordinar-entrega" }), context);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(obtenerPedidoAdminPorId).toHaveBeenCalledTimes(2);
    expect(marcarPedidoPagado).not.toHaveBeenCalled();
    expect(cancelarPedido).not.toHaveBeenCalled();
  });

  it("Cancelar exige motivo", async () => {
    const response = await PATCH(
      request({ action: "cancelar", motivoCancelacion: "   " }),
      context
    );
    expect(response.status).toBe(400);
    expect(cancelarPedido).not.toHaveBeenCalled();
  });

  it("rechaza datos bancarios y otras claves enviadas por el cliente", async () => {
    const response = await PATCH(
      request({ action: "agendar", banco: "BANCO_ATACANTE", total: 1 }),
      context
    );
    expect(response.status).toBe(400);
    expect(agendarPedido).not.toHaveBeenCalled();
  });

  it("rechaza JSON invalido", async () => {
    const response = await PATCH(request("{", true), context);
    expect(response.status).toBe(400);
    expect(agendarPedido).not.toHaveBeenCalled();
  });
});
