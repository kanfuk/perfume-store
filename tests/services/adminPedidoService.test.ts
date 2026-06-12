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
        fechaAgendado?: string;
        fechaCierre?: string;
      }
    | undefined;
  public pagosRegistrados: Array<{
    pedidoId: string;
    monto: number;
    metodoPago?: string;
    estadoPago: string;
  }> = [];
  public fiadosActualizados: Array<{
    pedidoId: string;
    clienteId: string;
    montoPendiente: number;
    estado: string;
  }> = [];

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
    fechaAgendado?: string;
    fechaCierre?: string;
  }) {
    this.actualizado = args;
  }

  async buscarPagosPorPedidoIds() {
    return this.pagosRegistrados.map((payment, index) => ({
      id: `pago-${index + 1}`,
      pedidoId: payment.pedidoId,
      monto: payment.monto,
      metodoPago: payment.metodoPago,
      estadoPago: payment.estadoPago,
      fechaPago: new Date("2026-06-12T12:00:00.000Z").toISOString()
    }));
  }

  async buscarFiadosPorPedidoIds(pedidoIds: string[]) {
    return this.fiadosActualizados
      .filter((fiado) => pedidoIds.includes(fiado.pedidoId))
      .map((fiado, index) => ({
        id: `fiado-${index + 1}`,
        pedidoId: fiado.pedidoId,
        clienteId: fiado.clienteId,
        montoPendiente: fiado.montoPendiente,
        estado: fiado.estado,
        fechaFiado: new Date("2026-06-12T12:00:00.000Z").toISOString(),
        fechaPagoFiado:
          fiado.estado === "PAGADO"
            ? new Date("2026-06-12T14:00:00.000Z").toISOString()
            : undefined
      }));
  }

  async insertarPago(args: {
    pedidoId: string;
    monto: number;
    metodoPago?: string;
    estadoPago: string;
  }) {
    this.pagosRegistrados.push(args);
    return { id: `pago-${this.pagosRegistrados.length}` };
  }

  async upsertFiado(args: {
    pedidoId: string;
    clienteId: string;
    montoPendiente: number;
    estado: string;
  }) {
    const currentIndex = this.fiadosActualizados.findIndex(
      (item) => item.pedidoId === args.pedidoId
    );

    if (currentIndex >= 0) {
      this.fiadosActualizados[currentIndex] = args;
      return;
    }

    this.fiadosActualizados.push(args);
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
    items: [
      {
        productoId: "pan-amasado",
        productoNombre: "Pan amasado",
        cantidad: 2,
        precioUnitario: 500,
        subtotal: 1000
      }
    ],
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
    expect(repository.pagosRegistrados[0]?.monto).toBe(1000);
  });

  it("marca fiado un pedido agendado y registra saldo pendiente", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO")]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.marcarPedidoFiado("pedido-1");

    expect(repository.actualizado?.estadoPedido).toBe("FINALIZADO");
    expect(repository.actualizado?.estadoPago).toBe("FIADO");
    expect(repository.fiadosActualizados[0]?.montoPendiente).toBe(1000);
    expect(repository.fiadosActualizados[0]?.estado).toBe("PENDIENTE");
  });

  it("registra un abono parcial sobre un pedido fiado", async () => {
    const repository = new AdminPedidoRepositoryStub({
      FINALIZADO: [{ ...buildOrder("FINALIZADO"), estadoPago: "FIADO" }]
    });
    repository.fiadosActualizados.push({
      pedidoId: "pedido-1",
      clienteId: "cliente-1",
      montoPendiente: 1000,
      estado: "PENDIENTE"
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.registrarAbonoFiado("pedido-1", 400, "TRANSFERENCIA");

    expect(repository.pagosRegistrados.at(-1)?.monto).toBe(400);
    expect(repository.fiadosActualizados[0]?.montoPendiente).toBe(600);
    expect(repository.actualizado?.estadoPago).toBeUndefined();
  });

  it("cierra un fiado cuando el abono cubre todo el saldo", async () => {
    const repository = new AdminPedidoRepositoryStub({
      FINALIZADO: [{ ...buildOrder("FINALIZADO"), estadoPago: "FIADO" }]
    });
    repository.fiadosActualizados.push({
      pedidoId: "pedido-1",
      clienteId: "cliente-1",
      montoPendiente: 1000,
      estado: "PENDIENTE"
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.registrarAbonoFiado("pedido-1", 1000);

    expect(repository.fiadosActualizados[0]?.estado).toBe("PAGADO");
    expect(repository.fiadosActualizados[0]?.montoPendiente).toBe(0);
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
