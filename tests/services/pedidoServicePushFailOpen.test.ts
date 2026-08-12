import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClienteRepository, IdentidadPedido } from "@/repositories/clienteRepository";
import type {
  CrearPedidoTransaccionalInput,
  CrearVentaDirectaTransaccionalInput,
  PedidoEstadoTransaccionalResult,
  PedidoRepository,
  PedidoTransaccionalResult
} from "@/repositories/pedidoRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { METODO_DESPACHO_STARKEN_POR_PAGAR } from "@/lib/constants";
import type { Cliente } from "@/domain/Cliente";
import type { Pedido } from "@/domain/Pedido";

const { sendPendingOrdersPushToAdmins } = vi.hoisted(() => ({
  sendPendingOrdersPushToAdmins: vi.fn()
}));

vi.mock("@/lib/pwa/sendWebPush", () => ({ sendPendingOrdersPushToAdmins }));

import { PedidoService } from "@/services/pedidoService";

class ProductRepositoryStub implements ProductRepository {
  async buscarProductosActivos() {
    return [
      {
        id: "perfume-1",
        nombre: "Perfume floral",
        precioVenta: 500,
        stockActual: 20,
        stockAgenda: 20,
        activo: true
      }
    ];
  }

  async buscarProductoPorId(id: string) {
    if (id === "perfume-1") {
      return {
        id: "perfume-1",
        nombre: "Perfume floral",
        precioVenta: 500,
        stockActual: 20,
        stockAgenda: 20,
        activo: true
      };
    }
    return null;
  }

  async buscarProductoPorSku() {
    return null;
  }

  async buscarTodosProductos() {
    return this.buscarProductosActivos();
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const product = await this.buscarProductoPorId(id);
    if (!product) throw new Error("Producto no encontrado.");
    return { ...product, stockAgenda: (product.stockAgenda ?? 0) + cantidad };
  }

  async eliminarProducto() {
    return;
  }

  async archivarProductoSeguro() {
    return { alreadyArchived: false };
  }

  async eliminarProductoSeguro() {
    return {};
  }

  async crearProducto(producto: { id?: string; nombre: string; precioVenta: number }) {
    return {
      id: producto.id ?? "nuevo-producto",
      nombre: producto.nombre,
      descripcion: "",
      precioVenta: producto.precioVenta,
      costoUnitario: 0,
      stockActual: 0,
      stockAgenda: 0,
      activo: true,
      tipoProducto: "simple"
    };
  }

  async actualizarProducto(id: string, cambios: { nombre?: string; precioVenta?: number }) {
    return {
      id,
      nombre: cambios.nombre ?? "Producto",
      descripcion: "",
      precioVenta: cambios.precioVenta ?? 0,
      costoUnitario: 0,
      stockActual: 0,
      stockAgenda: 0,
      activo: true,
      tipoProducto: "simple"
    };
  }
}

class ClienteRepositoryStub implements ClienteRepository {
  async upsertCliente(cliente: Cliente) {
    return { id: `cliente-${cliente.nombre}` };
  }

  async buscarClienteRelacionado() {
    return null;
  }

  async actualizarCliente(cliente: Cliente) {
    return { id: cliente.id ?? `cliente-${cliente.nombre}` };
  }

  async buscarClientePorId() {
    return null;
  }

  async actualizarEstadoBloqueo(): Promise<Cliente> {
    throw new Error("No usado en estos tests.");
  }

  async buscarClienteBloqueadoPorIdentidad(_identidad: IdentidadPedido) {
    return null;
  }
}

const DEFAULT_TRANSACTIONAL_RESULT: PedidoTransaccionalResult = {
  pedidoId: "pedido-rpc-1",
  codigo: "PERF-2026-000001",
  clienteId: "cliente-rpc-1",
  subtotal: 1000,
  costoDespacho: 0,
  total: 1000,
  estadoPedido: "NUEVO",
  estadoPago: "SIN_PAGO",
  metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
  origenPedido: "PUBLICO",
  items: [
    {
      productoId: "perfume-1",
      nombre: "Perfume floral",
      cantidad: 2,
      precioUnitario: 500,
      costoUnitario: 0,
      costoTotal: 0,
      utilidadBruta: 1000,
      subtotal: 1000
    }
  ]
};

class PedidoRepositoryStub implements PedidoRepository {
  async insertarPedido(args: { pedido: Pedido; clienteId: string }) {
    return { id: `pedido-${args.clienteId}`, codigo: "PS-TEST" };
  }

  async insertarPedidoItem() {
    return { id: "item-1" };
  }

  async buscarPedidosPorEstado() {
    return [];
  }

  async buscarVentasPorProducto() {
    return [];
  }

  async buscarPagosPorPedidoIds() {
    return [];
  }

  async buscarFiadosPorPedidoIds() {
    return [];
  }

  async insertarPago() {
    return { id: "pago-1" };
  }

  async upsertFiado() {
    return;
  }

  async actualizarEstadoPedido() {
    return;
  }

  async actualizarClientePedido() {
    return;
  }

  async crearPedidoTransaccional(
    _input: CrearPedidoTransaccionalInput
  ): Promise<PedidoTransaccionalResult> {
    return DEFAULT_TRANSACTIONAL_RESULT;
  }

  async crearVentaDirectaTransaccional(
    _input: CrearVentaDirectaTransaccionalInput
  ): Promise<PedidoTransaccionalResult> {
    throw new Error("No usado en estos tests.");
  }

  async marcarPedidoPagadoTransaccional(pedidoId: string): Promise<PedidoEstadoTransaccionalResult> {
    return { pedidoId, estadoPedido: "PAGADO", estadoPago: "PAGADO" };
  }

  async cancelarPedidoTransaccional(pedidoId: string): Promise<PedidoEstadoTransaccionalResult> {
    return { pedidoId, estadoPedido: "CANCELADO", estadoPago: "CANCELADO" };
  }

  async avanzarEstadoPedidoTransaccional(
    pedidoId: string,
    nuevoEstado: "PREPARANDO" | "DESPACHADO" | "ENTREGADO"
  ): Promise<PedidoEstadoTransaccionalResult> {
    return { pedidoId, estadoPedido: nuevoEstado };
  }
}

function baseCustomerOrderInput(): Parameters<InstanceType<typeof PedidoService>["crearPedido"]>[0] {
  return {
    nombre: "Rodrigo",
    rut: "11.111.111-1",
    email: "rodrigo@example.com",
    telefono: "999999999",
    region: "Región Metropolitana de Santiago",
    comuna: "Providencia",
    direccion: "Calle Falsa 123",
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
    items: [{ productoId: "perfume-1", cantidad: 2 }]
  };
}

describe("PedidoService.crearPedido - fail-open ante fallas de push", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendPendingOrdersPushToAdmins.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("crea el pedido aunque sendPendingOrdersPushToAdmins lance una excepcion", async () => {
    sendPendingOrdersPushToAdmins.mockRejectedValue(new Error("push service unavailable"));
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    const result = await service.crearPedido(baseCustomerOrderInput());

    expect(result).toEqual(DEFAULT_TRANSACTIONAL_RESULT);
    expect(errorSpy).toHaveBeenCalledWith(
      "[push] admin pending-orders push threw",
      expect.objectContaining({ pedidoId: "pedido-rpc-1", reason: "push service unavailable" })
    );
  });

  it("crea el pedido y registra un warning seguro cuando el push falla parcialmente", async () => {
    sendPendingOrdersPushToAdmins.mockResolvedValue({
      sent: 0,
      failed: 1,
      expired: 0,
      skipped: false
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    const result = await service.crearPedido(baseCustomerOrderInput());

    expect(result).toEqual(DEFAULT_TRANSACTIONAL_RESULT);
    expect(warnSpy).toHaveBeenCalledWith(
      "[push] admin pending-orders push incomplete",
      expect.objectContaining({ pedidoId: "pedido-rpc-1", sent: 0, failed: 1 })
    );

    const loggedPayload = JSON.stringify(warnSpy.mock.calls[0]);
    expect(loggedPayload).not.toMatch(/endpoint|p256dh|auth|clienteNombre|telefono|direccion/i);
  });
});
