import { describe, expect, it } from "vitest";
import { Cliente } from "@/domain/Cliente";
import { Pedido } from "@/domain/Pedido";
import { METODO_DESPACHO_STARKEN_POR_PAGAR } from "@/lib/constants";
import { PerfumeOrderError } from "@/lib/perfumeOrderErrors";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import type {
  PedidoEstadoTransaccionalResult,
  PedidoListItemRecord,
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

  async buscarProductoPorSku() {
    return null;
  }

  async buscarTodosProductos() {
    return this.buscarProductosActivos();
  }

  async ajustarStockAgenda(id: string, cantidad: number) {
    const product = await this.buscarProductoPorId();

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
    return { id: cliente.id ?? "cliente-1" };
  }

  async buscarClienteRelacionado() {
    return null;
  }

  async actualizarCliente(cliente: Cliente) {
    return { id: cliente.id ?? "cliente-1" };
  }
}

/**
 * Simula, del lado TypeScript, el comportamiento observable de
 * mark_perfume_order_paid_v1 / cancel_perfume_order_v1 /
 * advance_perfume_order_status_v1 (validacion de estado, PFxxx) para poder
 * probar PedidoService sin una base de datos real. El comportamiento real
 * transaccional solo se valida contra Postgres en
 * supabase/tests/perfume_store_transactional_stock.sql.
 */
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
  public marcarPagadoCalls: Array<{ pedidoId: string; metodoPago?: string }> = [];
  public cancelarCalls: Array<{ pedidoId: string; motivo: string; confirmar: boolean }> = [];
  public avanzarCalls: Array<{ pedidoId: string; nuevoEstado: string }> = [];

  private readonly pedidos = new Map<string, { estadoPedido: string; estadoPago: string }>();

  constructor(private readonly ordersByState: Record<string, PedidoListItemRecord[]>) {
    for (const orders of Object.values(ordersByState)) {
      for (const order of orders) {
        this.pedidos.set(order.id, {
          estadoPedido: order.estadoPedido,
          estadoPago: order.estadoPago
        });
      }
    }
  }

  async insertarPedido(args: { pedido: Pedido; clienteId: string }) {
    return { id: `pedido-${args.clienteId}` };
  }

  async insertarPedidoItem() {
    return { id: "item-1" };
  }

  async buscarPedidosPorEstado(estadoPedido: string) {
    // Filtra por el estado "vivo" en this.pedidos (mutado por
    // marcarPedidoPagadoTransaccional/cancelarPedidoTransaccional), no por
    // el bucket original con el que se construyo el stub: asi una consulta
    // posterior a una transicion refleja el estado real, igual que la RPC.
    const allOrders = Object.values(this.ordersByState).flat();
    return allOrders.filter(
      (order) => this.pedidos.get(order.id)?.estadoPedido === estadoPedido
    );
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

  async crearPedidoTransaccional(): Promise<PedidoTransaccionalResult> {
    throw new Error("No usado en estas pruebas administrativas.");
  }

  async crearVentaDirectaTransaccional(): Promise<PedidoTransaccionalResult> {
    throw new Error("No usado en estas pruebas administrativas.");
  }

  async marcarPedidoPagadoTransaccional(
    pedidoId: string,
    metodoPago?: string
  ): Promise<PedidoEstadoTransaccionalResult> {
    this.marcarPagadoCalls.push({ pedidoId, metodoPago });

    const pedido = this.pedidos.get(pedidoId);

    if (!pedido) {
      throw new PerfumeOrderError("PF009", "Pedido no encontrado.");
    }

    if (pedido.estadoPedido !== "NUEVO" && pedido.estadoPedido !== "AGENDADO") {
      throw new PerfumeOrderError(
        "PF012",
        "Este pedido no admite marcar pagado en su estado actual."
      );
    }

    pedido.estadoPedido = "PAGADO";
    pedido.estadoPago = "PAGADO";
    this.pagosRegistrados.push({
      pedidoId,
      monto: 1000,
      metodoPago,
      estadoPago: "PAGADO"
    });

    return { pedidoId, estadoPedido: "PAGADO", estadoPago: "PAGADO" };
  }

  async cancelarPedidoTransaccional(
    pedidoId: string,
    motivo: string,
    confirmarReposicionPagado: boolean
  ): Promise<PedidoEstadoTransaccionalResult> {
    this.cancelarCalls.push({ pedidoId, motivo, confirmar: confirmarReposicionPagado });

    const pedido = this.pedidos.get(pedidoId);

    if (!pedido) {
      throw new PerfumeOrderError("PF009", "Pedido no encontrado.");
    }

    if (pedido.estadoPedido === "CANCELADO") {
      throw new PerfumeOrderError("PF011", "Este pedido ya fue cancelado.");
    }

    if (pedido.estadoPedido === "ENTREGADO") {
      throw new PerfumeOrderError(
        "PF012",
        "Un pedido entregado no se puede cancelar por este flujo."
      );
    }

    if (pedido.estadoPago === "PAGADO" && !confirmarReposicionPagado) {
      throw new PerfumeOrderError(
        "PF013",
        "Este pedido ya fue pagado. Confirma explicitamente para cancelarlo."
      );
    }

    const estadoPagoFinal = pedido.estadoPago === "PAGADO" ? "PAGADO" : "CANCELADO";
    pedido.estadoPedido = "CANCELADO";
    pedido.estadoPago = estadoPagoFinal;
    this.actualizado = {
      pedidoId,
      estadoPedido: "CANCELADO",
      estadoPago: estadoPagoFinal,
      stockRepuesto: true
    };

    return { pedidoId, estadoPedido: "CANCELADO", estadoPago: estadoPagoFinal };
  }

  async avanzarEstadoPedidoTransaccional(
    pedidoId: string,
    nuevoEstado: "PREPARANDO" | "DESPACHADO" | "ENTREGADO"
  ): Promise<PedidoEstadoTransaccionalResult> {
    this.avanzarCalls.push({ pedidoId, nuevoEstado });

    const pedido = this.pedidos.get(pedidoId);

    if (!pedido) {
      throw new PerfumeOrderError("PF009", "Pedido no encontrado.");
    }

    pedido.estadoPedido = nuevoEstado;

    return { pedidoId, estadoPedido: nuevoEstado };
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

  it("marca pagado un pedido agendado via mark_perfume_order_paid_v1 (no salta directo a entregado)", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO")]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.marcarPedidoPagado("pedido-1");

    expect(repository.marcarPagadoCalls).toEqual([
      { pedidoId: "pedido-1", metodoPago: "TRANSFERENCIA" }
    ]);
    expect(repository.actualizado?.estadoPedido).toBe("PAGADO");
    expect(repository.actualizado?.estadoPago).toBe("PAGADO");
    expect(repository.actualizado?.adminSeen).toBe(true);
    expect(repository.pagosRegistrados[0]?.monto).toBe(1000);
  });

  it("recorre preparando -> despachado -> entregado via advance_perfume_order_status_v1", async () => {
    const repositoryPreparando = new AdminPedidoRepositoryStub({
      PAGADO: [buildOrder("PAGADO", { estadoPago: "PAGADO" })]
    });
    const servicePreparando = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repositoryPreparando
    );
    await servicePreparando.iniciarPreparacionPedido("pedido-1");
    expect(repositoryPreparando.avanzarCalls).toEqual([
      { pedidoId: "pedido-1", nuevoEstado: "PREPARANDO" }
    ]);

    const repositoryDespachado = new AdminPedidoRepositoryStub({
      PREPARANDO: [buildOrder("PREPARANDO", { estadoPago: "PAGADO" })]
    });
    const serviceDespachado = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repositoryDespachado
    );
    await serviceDespachado.despacharPedido("pedido-1");
    expect(repositoryDespachado.avanzarCalls).toEqual([
      { pedidoId: "pedido-1", nuevoEstado: "DESPACHADO" }
    ]);

    const repositoryEntregado = new AdminPedidoRepositoryStub({
      DESPACHADO: [buildOrder("DESPACHADO", { estadoPago: "PAGADO" })]
    });
    const serviceEntregado = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repositoryEntregado
    );
    await serviceEntregado.entregarPedido("pedido-1");
    expect(repositoryEntregado.avanzarCalls).toEqual([
      { pedidoId: "pedido-1", nuevoEstado: "ENTREGADO" }
    ]);
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

  it("cancela un pedido agendado via cancel_perfume_order_v1 sin exigir confirmacion (no estaba pagado)", async () => {
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

    expect(repository.cancelarCalls).toEqual([
      { pedidoId: "pedido-1", motivo: "Cliente no confirma", confirmar: false }
    ]);
    expect(repository.actualizado?.estadoPedido).toBe("CANCELADO");
    expect(repository.actualizado?.estadoPago).toBe("CANCELADO");
    expect(repository.actualizado?.stockRepuesto).toBe(true);
  });

  it("cancelarPedido delega enteramente en la RPC: no reimplementa reposicion de stock en TypeScript", async () => {
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

    expect(repository.cancelarCalls).toHaveLength(1);
    expect(productRepository.stockAdjustments).toEqual([]);
  });

  it("exige confirmacion explicita para cancelar un pedido ya pagado (sin valor por defecto implicito)", async () => {
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
    expect(repository.cancelarCalls[0]).toEqual({
      pedidoId: "pedido-1",
      motivo: "Se arrepintio",
      confirmar: false
    });

    await service.cancelarPedido("pedido-1", "Se arrepintio", {
      confirmarPagoPerdido: true
    });
    expect(repository.cancelarCalls[1]).toEqual({
      pedidoId: "pedido-1",
      motivo: "Se arrepintio",
      confirmar: true
    });
    expect(repository.actualizado?.estadoPedido).toBe("CANCELADO");
  });

  it("cancelar dos veces el mismo pedido es idempotente (la RPC rechaza con PF011, el servicio no repite efectos)", async () => {
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
    expect(repository.cancelarCalls).toHaveLength(1);

    await expect(
      service.cancelarPedido("pedido-1", "Cliente no confirma")
    ).resolves.toBeUndefined();
    expect(repository.cancelarCalls).toHaveLength(2);
  });

  it("no permite marcar pagado si el pedido no existe (la RPC rechaza con PF009)", async () => {
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

  it("confirmar pago dos veces es idempotente (la RPC rechaza con PF010, el servicio no repite la venta ni el descuento de stock)", async () => {
    const repository = new AdminPedidoRepositoryStub({
      AGENDADO: [buildOrder("AGENDADO")]
    });
    const service = new PedidoService(
      new ProductRepositoryStub(),
      new ClienteRepositoryStub(),
      repository
    );

    await service.marcarPedidoPagado("pedido-1");
    expect(repository.marcarPagadoCalls).toHaveLength(1);
    expect(repository.pagosRegistrados).toHaveLength(1);

    await expect(service.marcarPedidoPagado("pedido-1")).resolves.toBeUndefined();
    expect(repository.marcarPagadoCalls).toHaveLength(2);
    expect(repository.pagosRegistrados).toHaveLength(1);
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
