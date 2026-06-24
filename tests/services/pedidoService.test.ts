import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { Pedido } from "@/domain/Pedido";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import type { PedidoRepository } from "@/repositories/pedidoRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { PedidoService } from "@/services/pedidoService";

class ProductRepositoryStub implements ProductRepository {
  async buscarProductosActivos() {
    return [
      {
        id: "pan-amasado",
        nombre: "Pan amasado",
        precioVenta: 500,
        stockActual: 20,
        stockAgenda: 20,
        activo: true
      },
      {
        id: "queque",
        nombre: "Queque",
        precioVenta: 4500,
        stockActual: 10,
        stockAgenda: 10,
        activo: true
      }
    ];
  }

  async buscarProductoPorId(id: string) {
    if (id === "pan-amasado") {
      return {
        id: "pan-amasado",
        nombre: "Pan amasado",
        precioVenta: 500,
        stockActual: 20,
        stockAgenda: 20,
        activo: true
      };
    }

    if (id === "queque") {
      return {
        id: "queque",
        nombre: "Queque",
        precioVenta: 4500,
        stockActual: 10,
        stockAgenda: 10,
        activo: true
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
}

class PedidoRepositoryStub implements PedidoRepository {
  public itemsRegistrados = 0;

  async insertarPedido(args: { pedido: Pedido; clienteId: string }) {
    return { id: `pedido-${args.clienteId}` };
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
}

describe("PedidoService", () => {
  it("recalcula y registra un pedido valido", async () => {
    const pedidoRepository = new PedidoRepositoryStub();
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      pedidoRepository
    );

    const result = await service.crearPedido({
      nombre: "Rodrigo",
      telefono: "999999999",
      lugarTrabajo: "Finanzas",
      fechaEntrega: "2026-06-13",
      items: [
        { productoId: "pan-amasado", cantidad: 2 },
        { productoId: "queque", cantidad: 1 }
      ]
    });

    expect(result.total).toBe(5500);
    expect(result.estadoPedido).toBe("PENDIENTE");
    expect(result.estadoPago).toBe("SIN_PAGO");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.precioUnitario).toBe(500);
    expect(pedidoRepository.itemsRegistrados).toBe(2);
    expect(result.clienteId).toBe("cliente-Rodrigo");
  });

  it("rechaza un producto inexistente o inactivo", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    await expect(
      service.crearPedido({
        nombre: "Rodrigo",
        telefono: "999999999",
        lugarTrabajo: "Finanzas",
        fechaEntrega: "2026-06-13",
        items: [{ productoId: "otro", cantidad: 1 }]
      })
    ).rejects.toThrow("Todos los items deben usar productos activos.");
  });

  it("normaliza el celular chileno antes de guardar", async () => {
    let telefonoGuardado = "";

    class ClienteRepositoryPhoneStub implements ClienteRepository {
      async upsertCliente(cliente: Cliente) {
        telefonoGuardado = cliente.telefono;
        return { id: "cliente-telefono" };
      }
    }

    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryPhoneStub(),
      new PedidoRepositoryStub()
    );

    await service.crearPedido({
      nombre: "Rodrigo",
      telefono: "9 1234 5678",
      lugarTrabajo: "Finanzas",
      fechaEntrega: "2026-06-13",
      items: [{ productoId: "pan-amasado", cantidad: 1 }]
    });

    expect(telefonoGuardado).toBe("+56912345678");
  });

  it("rechaza cantidades mayores al stock actual disponible", async () => {
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      new PedidoRepositoryStub()
    );

    await expect(
      service.crearPedido({
        nombre: "Rodrigo",
        telefono: "999999999",
        lugarTrabajo: "Finanzas",
        fechaEntrega: "2026-06-13",
        items: [{ productoId: "pan-amasado", cantidad: 21 }]
      })
    ).rejects.toThrow("El producto Pan amasado solo tiene 20 disponible(s).");
  });
});
