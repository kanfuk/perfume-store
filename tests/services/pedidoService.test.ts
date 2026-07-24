import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { Pedido } from "@/domain/Pedido";
import { METODO_DESPACHO_DOMICILIO_SEMANAL, METODO_DESPACHO_STARKEN_POR_PAGAR } from "@/lib/constants";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import type { PedidoRepository } from "@/repositories/pedidoRepository";
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

class PedidoRepositoryStub implements PedidoRepository {
  public itemsRegistrados = 0;
  public pedidoRegistrado:
    | { pedido: Pedido; clienteId: string; origenPedido?: string; observacion?: string }
    | undefined;

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
}

function baseCustomerOrderInput(
  overrides: Partial<Parameters<PedidoService["crearPedido"]>[0]> = {}
): Parameters<PedidoService["crearPedido"]>[0] {
  return {
    nombre: "Rodrigo",
    rut: "11.111.111-1",
    email: "rodrigo@example.com",
    telefono: "999999999",
    region: "Metropolitana",
    comuna: "Providencia",
    direccion: "Calle Falsa 123",
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
    items: [{ productoId: "perfume-1", cantidad: 2 }],
    ...overrides
  };
}

describe("PedidoService", () => {
  it("recalcula y registra un pedido valido en estado NUEVO/SIN_PAGO", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    const result = await service.crearPedido(
      baseCustomerOrderInput({
        items: [
          { productoId: "perfume-1", cantidad: 2 },
          { productoId: "perfume-2", cantidad: 1 }
        ]
      })
    );

    expect(result.subtotal).toBe(5500);
    expect(result.costoDespacho).toBe(0);
    expect(result.total).toBe(5500);
    expect(result.estadoPedido).toBe("NUEVO");
    expect(result.estadoPago).toBe("SIN_PAGO");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.precioUnitario).toBe(500);
    expect(pedidoRepository.itemsRegistrados).toBe(2);
    expect(result.clienteId).toBe("cliente-Rodrigo");
  });

  it("suma el costo de despacho a domicilio semanal una sola vez, no por producto", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    const result = await service.crearPedido(
      baseCustomerOrderInput({
        metodoDespacho: METODO_DESPACHO_DOMICILIO_SEMANAL,
        items: [
          { productoId: "perfume-1", cantidad: 2 },
          { productoId: "perfume-2", cantidad: 1 }
        ]
      })
    );

    expect(result.subtotal).toBe(5500);
    expect(result.costoDespacho).toBe(4000);
    expect(result.total).toBe(9500);
  });

  it("ignora cualquier precio o total enviado desde el navegador: usa el del repositorio", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    const maliciousInput = {
      ...baseCustomerOrderInput({ items: [{ productoId: "perfume-1", cantidad: 1 }] }),
      // Campos que un cliente malicioso podria intentar inyectar; el tipo
      // CustomerOrderRequest ni siquiera los declara, pero se envian igual
      // para confirmar que el servicio no los usa en ningun calculo.
      total: 1,
      subtotal: 1,
      precioVenta: 1
    } as Parameters<PedidoService["crearPedido"]>[0];

    const result = await service.crearPedido(maliciousInput);

    expect(result.subtotal).toBe(500);
    expect(result.total).toBe(500);
  });

  it("rechaza un producto inexistente o inactivo", async () => {
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

  it("rechaza un RUT invalido", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    await expect(
      service.crearPedido(baseCustomerOrderInput({ rut: "11.111.111-9" }))
    ).rejects.toThrow();
  });

  it("normaliza el celular chileno antes de guardar", async () => {
    let telefonoGuardado = "";

    class ClienteRepositoryPhoneStub implements ClienteRepository {
      async upsertCliente(cliente: Cliente) {
        telefonoGuardado = cliente.telefono;
        return { id: "cliente-telefono" };
      }

      async buscarClienteRelacionado() {
        return null;
      }

      async actualizarCliente(cliente: Cliente) {
        telefonoGuardado = cliente.telefono;
        return { id: cliente.id ?? "cliente-telefono" };
      }
    }

    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryPhoneStub(),
      new PedidoRepositoryStub()
    );

    await service.crearPedido(
      baseCustomerOrderInput({
        telefono: "9 1234 5678",
        items: [{ productoId: "perfume-1", cantidad: 1 }]
      })
    );

    expect(telefonoGuardado).toBe("+56912345678");
  });

  it("rechaza cantidades mayores al stock actual disponible", async () => {
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
