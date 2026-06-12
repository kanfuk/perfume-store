import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { Pedido } from "@/domain/Pedido";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import type {
  PedidoListItemRecord,
  PedidoRepository
} from "@/repositories/pedidoRepository";
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

  async buscarProductoPorId() {
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
    return { id: cliente.id ?? "cliente-1" };
  }
}

class AdminPedidoRepositoryStub implements PedidoRepository {
  public actualizado:
    | {
        pedidoId: string;
        estadoPedido: string;
        estadoPago?: string;
      }
    | undefined;

  constructor(private readonly ordersByState: Record<string, PedidoListItemRecord[]>) {}

  async insertarPedido(args: { pedido: Pedido; clienteId: string }) {
    return { id: `pedido-${args.clienteId}` };
  }

  async insertarPedidoItem() {
    return { id: "item-1" };
  }

  async buscarPedidosPorEstado(estadoPedido: string) {
    return this.ordersByState[estadoPedido] ?? [];
  }

  async actualizarEstadoPedido(args: {
    pedidoId: string;
    estadoPedido: string;
    estadoPago?: string;
  }) {
    this.actualizado = args;
  }
}

function buildOrder(estadoPedido: string): PedidoListItemRecord {
  return {
    id: "pedido-1",
    clienteId: "cliente-1",
    clienteNombre: "Rodrigo",
    clienteTelefono: "999999999",
    clienteLugarTrabajo: "Finanzas",
    productoId: "pan-amasado",
    productoNombre: "Pan amasado",
    cantidad: 2,
    precioUnitario: 500,
    subtotal: 1000,
    estadoPedido,
    estadoPago: "SIN_PAGO",
    total: 1000,
    fechaPedido: new Date("2026-06-12T10:00:00.000Z").toISOString()
  };
}

describe("PedidoService admin transitions", () => {
  it("agenda un pedido pendiente", async () => {
    const repository = new AdminPedidoRepositoryStub({
      PENDIENTE: [buildOrder("PENDIENTE")]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.agendarPedido("pedido-1");

    expect(repository.actualizado?.pedidoId).toBe("pedido-1");
    expect(repository.actualizado?.estadoPedido).toBe("AGENDADO");
    expect(repository.actualizado?.estadoPago).toBe("SIN_PAGO");
  });

  it("marca pagado un pedido agendado", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO")]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.marcarPedidoPagado("pedido-1");

    expect(repository.actualizado?.estadoPedido).toBe("FINALIZADO");
    expect(repository.actualizado?.estadoPago).toBe("PAGADO");
  });

  it("no permite marcar pagado si el pedido no existe en agendados", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: []
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await expect(service.marcarPedidoPagado("pedido-1")).rejects.toThrow(
      "Pedido no encontrado."
    );
  });
});
