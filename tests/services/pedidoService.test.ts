import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { Pedido } from "@/domain/Pedido";
import { METODO_DESPACHO_DOMICILIO_SEMANAL, METODO_DESPACHO_STARKEN_POR_PAGAR } from "@/lib/constants";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import type {
  CrearPedidoTransaccionalInput,
  PedidoEstadoTransaccionalResult,
  PedidoRepository,
  PedidoTransaccionalResult
} from "@/repositories/pedidoRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { PedidoService } from "@/services/pedidoService";

class ProductRepositoryStub implements ProductRepository {
  public stockAdjustments: Array<{ id: string; cantidad: number }> = [];

  async buscarProductosActivos() {
    return [
      {
        id: "perfume-1",
        nombre: "Perfume floral",
        precioVenta: 500,
        stockActual: 20,
        stockAgenda: 20,
        activo: true
      },
      {
        id: "perfume-2",
        nombre: "Perfume amaderado",
        precioVenta: 4500,
        stockActual: 10,
        stockAgenda: 10,
        activo: true
      },
      {
        id: "producto-sin-stock-controlado",
        nombre: "Producto libre",
        precioVenta: 2000,
        stockActual: 0,
        stockAgenda: 0,
        activo: false
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

    if (id === "perfume-2") {
      return {
        id: "perfume-2",
        nombre: "Perfume amaderado",
        precioVenta: 4500,
        stockActual: 10,
        stockAgenda: 10,
        activo: true
      };
    }

    if (id === "producto-sin-stock-controlado") {
      return {
        id: "producto-sin-stock-controlado",
        nombre: "Producto libre",
        precioVenta: 2000,
        stockActual: 0,
        stockAgenda: 0,
        activo: false
      };
    }

    return null;
  }

  async buscarTodosProductos() {
    return this.buscarProductosActivos();
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const product = await this.buscarProductoPorId(id);

    if (!product) {
      throw new Error("Producto no encontrado.");
    }

    this.stockAdjustments.push({ id, cantidad });

    return {
      ...product,
      stockAgenda: (product.stockAgenda ?? 0) + cantidad
    };
  }

  async eliminarProducto() {
    return;
  }

  async crearProducto(producto: {
    id?: string;
    nombre: string;
    descripcion?: string;
    precioVenta: number;
    costoUnitario?: number;
    stockActual?: number;
    stockAgenda?: number;
    activo?: boolean;
    tipoProducto?: string;
  }) {
    return {
      id: producto.id ?? "nuevo-producto",
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? "",
      precioVenta: producto.precioVenta,
      costoUnitario: producto.costoUnitario ?? 0,
      stockActual: producto.stockActual ?? 0,
      stockAgenda: producto.stockAgenda ?? producto.stockActual ?? 0,
      activo: producto.activo ?? true,
      tipoProducto: producto.tipoProducto ?? "simple"
    };
  }

  async actualizarProducto(
    id: string,
    cambios: {
      nombre?: string;
      descripcion?: string;
      precioVenta?: number;
      costoUnitario?: number;
      stockActual?: number;
      stockAgenda?: number;
      activo?: boolean;
      tipoProducto?: string;
    }
  ) {
    return {
      id,
      nombre: cambios.nombre ?? "Producto",
      descripcion: cambios.descripcion ?? "",
      precioVenta: cambios.precioVenta ?? 0,
      costoUnitario: cambios.costoUnitario ?? 0,
      stockActual: cambios.stockActual ?? 0,
      stockAgenda: cambios.stockAgenda ?? cambios.stockActual ?? 0,
      activo: cambios.activo ?? true,
      tipoProducto: cambios.tipoProducto ?? "simple"
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
  public itemsRegistrados = 0;
  public pedidoRegistrado:
    | { pedido: Pedido; clienteId: string; origenPedido?: string; observacion?: string }
    | undefined;
  public crearPedidoTransaccionalInput: CrearPedidoTransaccionalInput | undefined;
  public crearPedidoTransaccionalCalls = 0;
  public crearPedidoTransaccionalResult: PedidoTransaccionalResult = DEFAULT_TRANSACTIONAL_RESULT;

  async insertarPedido(args: {
    pedido: Pedido;
    clienteId: string;
    origenPedido?: string;
    observacion?: string;
  }) {
    this.pedidoRegistrado = args;
    return { id: `pedido-${args.clienteId}`, codigo: "PS-TEST" };
  }

  async insertarPedidoItem() {
    this.itemsRegistrados += 1;
    return { id: `item-${this.itemsRegistrados}` };
  }

  async buscarPedidosPorEstado() {
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
    input: CrearPedidoTransaccionalInput
  ): Promise<PedidoTransaccionalResult> {
    this.crearPedidoTransaccionalCalls += 1;
    this.crearPedidoTransaccionalInput = input;
    return this.crearPedidoTransaccionalResult;
  }

  async marcarPedidoPagadoTransaccional(
    pedidoId: string
  ): Promise<PedidoEstadoTransaccionalResult> {
    return { pedidoId, estadoPedido: "PAGADO", estadoPago: "PAGADO" };
  }

  async cancelarPedidoTransaccional(
    pedidoId: string
  ): Promise<PedidoEstadoTransaccionalResult> {
    return { pedidoId, estadoPedido: "CANCELADO", estadoPago: "CANCELADO" };
  }

  async avanzarEstadoPedidoTransaccional(
    pedidoId: string,
    nuevoEstado: "PREPARANDO" | "DESPACHADO" | "ENTREGADO"
  ): Promise<PedidoEstadoTransaccionalResult> {
    return { pedidoId, estadoPedido: nuevoEstado };
  }
}

function baseCustomerOrderInput(
  overrides: Partial<Parameters<PedidoService["crearPedido"]>[0]> = {}
): Parameters<PedidoService["crearPedido"]>[0] {
  return {
    nombre: "Rodrigo",
    rut: "11.111.111-1",
    email: "rodrigo@example.com",
    telefono: "999999999",
    region: "Región Metropolitana de Santiago",
    comuna: "Providencia",
    direccion: "Calle Falsa 123",
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
    items: [{ productoId: "perfume-1", cantidad: 2 }],
    ...overrides
  };
}

describe("PedidoService.crearPedido (flujo publico, Fase 1C)", () => {
  it("delega la creacion completa en crearPedidoTransaccional (create_perfume_order_v1)", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    await service.crearPedido(baseCustomerOrderInput());

    expect(pedidoRepository.crearPedidoTransaccionalCalls).toBe(1);
    expect(pedidoRepository.crearPedidoTransaccionalInput).toEqual({
      cliente: {
        nombre: "Rodrigo",
        rut: "11111111-1",
        email: "rodrigo@example.com",
        telefono: "+56999999999",
        region: "Región Metropolitana de Santiago",
        comuna: "Providencia",
        direccion: "Calle Falsa 123",
        referenciaDireccion: undefined
      },
      items: [{ productoId: "perfume-1", cantidad: 2 }],
      metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
      observacion: undefined,
      origenPedido: "PUBLICO"
    });
  });

  it("ya no usa el mecanismo heredado: no llama insertarPedido/insertarPedidoItem ni ajusta stock por su cuenta", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const productRepository = new ProductRepositoryStub();
    const service = new PedidoService(
      productRepository,
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    await service.crearPedido(baseCustomerOrderInput());

    expect(pedidoRepository.pedidoRegistrado).toBeUndefined();
    expect(pedidoRepository.itemsRegistrados).toBe(0);
    expect(productRepository.stockAdjustments).toEqual([]);
  });

  it("mapea la respuesta de la RPC tal cual, sin recalcular montos en el servicio", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    pedidoRepository.crearPedidoTransaccionalResult = {
      pedidoId: "pedido-xyz",
      codigo: "PERF-2026-000042",
      clienteId: "cliente-xyz",
      subtotal: 7777,
      costoDespacho: 4000,
      total: 11777,
      estadoPedido: "NUEVO",
      estadoPago: "SIN_PAGO",
      metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL,
      origenPedido: "PUBLICO",
      items: [
        {
          productoId: "perfume-1",
          nombre: "Perfume floral",
          cantidad: 3,
          precioUnitario: 2592,
          costoUnitario: 100,
          costoTotal: 300,
          utilidadBruta: 7476,
          subtotal: 7776
        }
      ]
    };
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    const result = await service.crearPedido(
      baseCustomerOrderInput({ metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL })
    );

    expect(result).toEqual(pedidoRepository.crearPedidoTransaccionalResult);
  });

  it("ignora cualquier precio o total enviado desde el navegador: nunca llega a la RPC", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    const maliciousInput = {
      ...baseCustomerOrderInput({ items: [{ productoId: "perfume-1", cantidad: 1 }] }),
      // Campos que un cliente malicioso podria intentar inyectar; el tipo
      // CustomerOrderRequest ni siquiera los declara, pero se envian igual
      // para confirmar que el servicio no los reenvia a la RPC.
      total: 1,
      subtotal: 1,
      precioVenta: 1
    } as Parameters<PedidoService["crearPedido"]>[0];

    await service.crearPedido(maliciousInput);

    expect(pedidoRepository.crearPedidoTransaccionalInput).not.toHaveProperty("total");
    expect(pedidoRepository.crearPedidoTransaccionalInput).not.toHaveProperty("subtotal");
    expect(pedidoRepository.crearPedidoTransaccionalInput?.items).toEqual([
      { productoId: "perfume-1", cantidad: 1 }
    ]);
  });

  it("rechaza un producto inexistente o inactivo antes de llegar a la RPC", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    await expect(
      service.crearPedido(
        baseCustomerOrderInput({ items: [{ productoId: "otro", cantidad: 1 }] })
      )
    ).rejects.toThrow("Todos los items deben usar productos activos.");
  });

  it("rechaza un RUT invalido antes de llegar a la RPC", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    await expect(
      service.crearPedido(baseCustomerOrderInput({ rut: "11.111.111-9" }))
    ).rejects.toThrow();
  });

  it("normaliza el celular chileno antes de enviarlo a la RPC", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    await service.crearPedido(
      baseCustomerOrderInput({
        telefono: "9 1234 5678",
        items: [{ productoId: "perfume-1", cantidad: 1 }]
      })
    );

    expect(pedidoRepository.crearPedidoTransaccionalInput?.cliente.telefono).toBe(
      "+56912345678"
    );
  });

  it("rechaza cantidades mayores al stock actual disponible (pre-chequeo de UX)", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    await expect(
      service.crearPedido(
        baseCustomerOrderInput({ items: [{ productoId: "perfume-1", cantidad: 21 }] })
      )
    ).rejects.toThrow("Perfume floral solo tiene 20 disponible(s).");
  });

  it("propaga sin envolver un error de la RPC (p.ej. stock insuficiente en el momento real)", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    pedidoRepository.crearPedidoTransaccional = async () => {
      const { PerfumeOrderError } = await import("@/lib/perfumeOrderErrors");
      throw new PerfumeOrderError("PF005", "Stock insuficiente para Perfume floral.");
    };
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    await expect(service.crearPedido(baseCustomerOrderInput())).rejects.toThrow(
      "Stock insuficiente para Perfume floral."
    );
  });
});

describe("PedidoService (flujos administrativos heredados: venta directa y personalizado)", () => {
  it("registra pedidos personalizados nuevos como NUEVO cuando aun no se agendan", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    const result = await service.crearPedidoPersonalizado({
      nombre: "Claudia",
      telefono: "9 1234 5678",
      nombreProducto: "Perfume especial",
      descripcion: "Sin alcohol",
      cantidad: 1,
      precioAcordado: 12000,
      estadoInicial: "NUEVO"
    });

    expect(result.estadoPedido).toBe("NUEVO");
    expect(result.estadoPago).toBe("SIN_PAGO");
    expect(pedidoRepository.pedidoRegistrado?.pedido.fechaAgendado).toBeUndefined();
    expect(pedidoRepository.pedidoRegistrado?.pedido.fechaPago).toBeUndefined();
  });

  it("permite venta directa de producto inactivo sin descontar stock, entregada en el acto", async () => {
    const productRepository = new ProductRepositoryStub();
    const service = new PedidoService(
      productRepository,
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    const result = await service.crearVentaDirecta({
      items: [{ productoId: "producto-sin-stock-controlado", cantidad: 3 }],
      estadoPago: "PAGADO",
      clienteModo: "ocasional"
    });

    expect(result.total).toBe(6000);
    expect(result.estadoPedido).toBe("ENTREGADO");
    expect(result.estadoPago).toBe("PAGADO");
    expect(productRepository.stockAdjustments).toEqual([]);
  });

  it("venta directa fiada queda SIN_PAGO (no existe FIADO como estadoPago de pedidos)", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    const result = await service.crearVentaDirecta({
      nombre: "Cliente fiado",
      items: [{ productoId: "perfume-1", cantidad: 1 }],
      estadoPago: "FIADO",
      clienteModo: "ocasional"
    });

    expect(result.estadoPedido).toBe("ENTREGADO");
    expect(result.estadoPago).toBe("SIN_PAGO");
  });

  it("descuenta stock en pedido personalizado solo si el producto base lo controla", async () => {
    const trackedRepository = new ProductRepositoryStub();
    const service = new PedidoService(
      trackedRepository,
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    await service.crearPedidoPersonalizado({
      nombre: "Claudia",
      nombreProducto: "Perfume especial",
      productoBaseId: "perfume-1",
      cantidad: 2,
      precioAcordado: 1500,
      estadoInicial: "PAGADO"
    });

    expect(trackedRepository.stockAdjustments).toEqual([{ id: "perfume-1", cantidad: -2 }]);

    trackedRepository.stockAdjustments = [];

    await service.crearPedidoPersonalizado({
      nombre: "Claudia",
      nombreProducto: "Producto libre",
      productoBaseId: "producto-sin-stock-controlado",
      cantidad: 2,
      precioAcordado: 4000,
      estadoInicial: "PAGADO"
    });

    expect(trackedRepository.stockAdjustments).toEqual([]);
  });
});
