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
        activo: true
      }
    ];
  }

  async buscarProductoPorId(id: string) {
    if (id !== "pan-amasado") {
      return null;
    }

    return {
      id: "pan-amasado",
      nombre: "Pan amasado",
      precioVenta: 500,
      activo: true
    };
  }
}

class ClienteRepositoryStub implements ClienteRepository {
  async insertarCliente(cliente: Cliente) {
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
      productoId: "pan-amasado",
      cantidad: 2
    });

    expect(result.total).toBe(1000);
    expect(result.estadoPedido).toBe("PENDIENTE");
    expect(result.estadoPago).toBe("SIN_PAGO");
    expect(result.producto.precioUnitario).toBe(500);
    expect(pedidoRepository.itemsRegistrados).toBe(1);
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
        productoId: "otro",
        cantidad: 1
      })
    ).rejects.toThrow("Selecciona un producto activo.");
  });
});
