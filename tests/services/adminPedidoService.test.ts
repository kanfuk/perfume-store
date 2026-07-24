import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { Pedido } from "@/domain/Pedido";
import { METODO_DESPACHO_STARKEN_POR_PAGAR } from "@/lib/constants";
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
        id: "perfume-1",
        nombre: "Perfume floral",
        precioVenta: 500,
        stockActual: 10,
        stockAgenda: 10,
        activo: true
      }
    ];
  }

  async buscarProductoPorId() {
    return {
      id: "perfume-1",
      nombre: "Perfume floral",
      precioVenta: 500,
      stockActual: 10,
      stockAgenda: 10,
      activo: true
    };
  }

  async buscarTodosProductos() {
    return this.buscarProductosActivos();
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const product = await this.buscarProductoPorId();

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
    return { id: cliente.id ?? "cliente-1" };
  }

  async buscarClienteRelacionado() {
    return null;
  }

  async actualizarCliente(cliente: Cliente) {
    return { id: cliente.id ?? "cliente-1" };
  }
}

class AdminPedidoRepositoryStub implements PedidoRepository {
  public actualizado:
    | {
        pedidoId: string;
        estadoPedido: string;
        estadoPago?: string;
        adminSeen?: boolean;
        adminSeenAt?: string;
        fechaAgendado?: string;
        fechaPago?: string;
        fechaPreparacion?: string;
        fechaDespacho?: string;
        fechaEntrega?: string;
        fechaCancelacion?: string;
        stockRepuesto?: boolean;
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
    adminSeen?: boolean;
    adminSeenAt?: string;
    fechaAgendado?: string;
    fechaPago?: string;
    fechaPreparacion?: string;
    fechaDespacho?: string;
    fechaEntrega?: string;
    fechaCancelacion?: string;
    stockRepuesto?: boolean;
  }) {
    this.actualizado = args;
  }

  async actualizarClientePedido() {
    return;
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

function buildOrder(estadoPedido: string, overrides: Partial<PedidoListItemRecord> = {}): PedidoListItemRecord {
  return {
    id: "pedido-1",
    clienteId: "cliente-1",
    clienteNombre: "Rodrigo",
    clienteTelefono: "+56999999999",
    clienteLugarTrabajo: "",
    productoId: "perfume-1",
    productoNombre: "Perfume floral",
    cantidad: 2,
    precioUnitario: 500,
    subtotal: 1000,
    items: [
      {
        productoId: "perfume-1",
        productoNombre: "Perfume floral",
        cantidad: 2,
        precioUnitario: 500,
        costoUnitario: 0,
        costoTotal: 0,
        utilidadBruta: 1000,
        subtotal: 1000
      }
    ],
    estadoPedido,
    estadoPago: "SIN_PAGO",
    metodoDespacho: METODO_DESPACHO_STARKEN_POR_PAGAR,
    costoDespacho: 0,
    adminSeen: false,
    total: 1000,
    fechaPedido: new Date("2026-06-12T10:00:00.000Z").toISOString(),
    ...overrides
  };
}

describe("PedidoService admin transitions", () => {
  it("agenda un pedido nuevo", async () => {
    const repository = new AdminPedidoRepositoryStub({
      NUEVO: [buildOrder("NUEVO")]
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
    expect(repository.actualizado?.adminSeen).toBe(true);
    expect(repository.actualizado?.fechaAgendado).toBeDefined();
  });

  it("permite agendar si el pedido ya habia reservado su stock", async () => {
    const repository = new AdminPedidoRepositoryStub({
      NUEVO: [buildOrder("NUEVO")]
    });

    class ProductRepositorySinStockStub extends ProductRepositoryStub {
      override async buscarProductosActivos() {
        return [
          {
            id: "perfume-1",
            nombre: "Perfume floral",
            precioVenta: 500,
            stockActual: 2,
            stockAgenda: 2,
            activo: true
          }
        ];
      }

      override async buscarProductoPorId() {
        return {
          id: "perfume-1",
          nombre: "Perfume floral",
          precioVenta: 500,
          stockActual: 2,
          stockAgenda: 2,
          activo: true
        };
      }
    }

    const service = new PedidoService(
      new ProductRepositorySinStockStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.agendarPedido("pedido-1");

    expect(repository.actualizado?.estadoPedido).toBe("AGENDADO");
  });

  it("marca pagado un pedido agendado (no salta directo a entregado)", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO")]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.marcarPedidoPagado("pedido-1");

    expect(repository.actualizado?.estadoPedido).toBe("PAGADO");
    expect(repository.actualizado?.estadoPago).toBe("PAGADO");
    expect(repository.pagosRegistrados[0]?.monto).toBe(1000);
  });

  it("recorre preparando -> despachado -> entregado", async () => {
    const repositoryPreparando = new AdminPedidoRepositoryStub({
      PAGADO: [buildOrder("PAGADO", { estadoPago: "PAGADO" })]
    });
    const servicePreparando = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repositoryPreparando
    );
    await servicePreparando.iniciarPreparacionPedido("pedido-1");
    expect(repositoryPreparando.actualizado?.estadoPedido).toBe("PREPARANDO");

    const repositoryDespachado = new AdminPedidoRepositoryStub({
      PREPARANDO: [buildOrder("PREPARANDO", { estadoPago: "PAGADO" })]
    });
    const serviceDespachado = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repositoryDespachado
    );
    await serviceDespachado.despacharPedido("pedido-1");
    expect(repositoryDespachado.actualizado?.estadoPedido).toBe("DESPACHADO");

    const repositoryEntregado = new AdminPedidoRepositoryStub({
      DESPACHADO: [buildOrder("DESPACHADO", { estadoPago: "PAGADO" })]
    });
    const serviceEntregado = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repositoryEntregado
    );
    await serviceEntregado.entregarPedido("pedido-1");
    expect(repositoryEntregado.actualizado?.estadoPedido).toBe("ENTREGADO");
  });

  it("registra un abono parcial sobre un pedido entregado sin pago (fiado de venta directa)", async () => {
    const repository = new AdminPedidoRepositoryStub({
      ENTREGADO: [{ ...buildOrder("ENTREGADO"), estadoPago: "SIN_PAGO" }]
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
      ENTREGADO: [{ ...buildOrder("ENTREGADO"), estadoPago: "SIN_PAGO" }]
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

  it("cancela un pedido agendado, repone stock y deja estadoPago CANCELADO", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO")]
    });
    const productRepository = new ProductRepositoryStub();
    const service = new PedidoService(
      productRepository,
      new ClienteRepositoryStub(),
      repository
    );

    await service.cancelarPedido("pedido-1", "Cliente no confirma");

    expect(repository.actualizado?.estadoPedido).toBe("CANCELADO");
    expect(repository.actualizado?.estadoPago).toBe("CANCELADO");
    expect(repository.actualizado?.stockRepuesto).toBe(true);
  });

  it("no repone stock dos veces si el pedido ya tenia stockRepuesto true", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO", { stockRepuesto: true })]
    });
    const productRepository = new ProductRepositoryStub();
    const ajustesSpy: Array<{ id: string; cantidad: number }> = [];
    const originalAjustar = productRepository.ajustarStockAgenda.bind(productRepository);
    productRepository.ajustarStockAgenda = async (id, cantidad) => {
      ajustesSpy.push({ id, cantidad });
      return originalAjustar(id, cantidad);
    };
    const service = new PedidoService(
      productRepository,
      new ClienteRepositoryStub(),
      repository
    );

    await service.cancelarPedido("pedido-1", "Cliente no confirma");

    expect(ajustesSpy).toEqual([]);
  });

  it("exige confirmacion explicita para cancelar un pedido ya pagado", async () => {
    const repository = new AdminPedidoRepositoryStub({
      PAGADO: [buildOrder("PAGADO", { estadoPago: "PAGADO" })]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await expect(service.cancelarPedido("pedido-1", "Se arrepintio")).rejects.toThrow(
      "Este pedido ya fue pagado. Confirma explicitamente para cancelarlo."
    );

    await service.cancelarPedido("pedido-1", "Se arrepintio", {
      confirmarPagoPerdido: true
    });
    expect(repository.actualizado?.estadoPedido).toBe("CANCELADO");
  });

  it("impide cancelar dos veces el mismo pedido (ya no aparece entre los estados abiertos)", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO")]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.cancelarPedido("pedido-1", "Cliente no confirma");
    expect(repository.actualizado?.estadoPedido).toBe("CANCELADO");

    // El repositorio stub no mueve el pedido de bucket automaticamente al
    // cancelarlo (a diferencia de Supabase real), asi que simulamos ese
    // efecto quitandolo de AGENDADO para probar que el servicio ya no lo
    // encuentra entre los estados abiertos.
    const repositorySinPedido = new AdminPedidoRepositoryStub({ AGENDADO: [] });
    const serviceSinPedido = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repositorySinPedido
    );

    await expect(
      serviceSinPedido.cancelarPedido("pedido-1", "Cliente no confirma")
    ).rejects.toThrow("Pedido no encontrado o ya no admite cancelacion.");
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

  it("cuenta como pendientes reales solo los pedidos nuevos sin agendar", async () => {
    const repository = new AdminPedidoRepositoryStub({
      NUEVO: [
        buildOrder("NUEVO"),
        {
          ...buildOrder("NUEVO"),
          id: "pedido-2",
          adminSeen: true
        }
      ],
      AGENDADO: [
        {
          ...buildOrder("AGENDADO"),
          id: "pedido-3",
          adminSeen: false
        },
        {
          ...buildOrder("AGENDADO"),
          id: "pedido-4",
          adminSeen: true
        }
      ],
      PAGADO: [],
      PREPARANDO: [],
      DESPACHADO: [],
      ENTREGADO: [],
      CANCELADO: []
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    const dashboard = await service.obtenerDashboardAdmin();

    expect(dashboard.pedidosNuevos).toBe(1);
    expect(dashboard.pendientes).toHaveLength(2);
    expect(dashboard.agendados).toHaveLength(2);
  });
});
