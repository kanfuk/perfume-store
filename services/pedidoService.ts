/**
 * Proyecto: Pauli Store
 * Modulo: Gestion de Pedidos
 * Descripcion: Servicio encargado de aplicar reglas de negocio sobre pedidos.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Separacion de responsabilidades y validacion de estados.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Cliente } from "@/domain/Cliente";
import { DetallePedido } from "@/domain/DetallePedido";
import { Pedido } from "@/domain/Pedido";
import { Producto } from "@/domain/Producto";
import {
  ESTADO_PAGO_FIADO,
  ESTADO_PAGO_PAGADO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_FINALIZADO,
  ESTADO_PEDIDO_PENDIENTE
} from "@/lib/constants";
import type {
  AdminDashboardData,
  AdminOrderSummary,
  CustomerOrderRequest,
  CustomerOrderResponse
} from "@/lib/types";
import { validateCustomerOrderForm } from "@/lib/validators";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import { getClienteRepository } from "@/repositories/clienteRepository";
import type { PedidoRepository } from "@/repositories/pedidoRepository";
import type { PedidoListItemRecord } from "@/repositories/pedidoRepository";
import { getPedidoRepository } from "@/repositories/pedidoRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { getProductRepository } from "@/repositories/productRepository";

export class PedidoService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly clienteRepository: ClienteRepository,
    private readonly pedidoRepository: PedidoRepository
  ) {}

  async crearPedido(input: CustomerOrderRequest): Promise<CustomerOrderResponse> {
    const products = await this.productRepository.buscarProductosActivos();
    const validation = validateCustomerOrderForm(input, products);

    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors)[0] ?? "Formulario invalido.");
    }

    const cliente = new Cliente({
      nombre: input.nombre,
      telefono: input.telefono,
      lugarTrabajo: input.lugarTrabajo
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const items = input.items.map((line) => {
      const productData = productMap.get(line.productoId);

      if (!productData || productData.activo === false) {
        throw new Error("El producto seleccionado no esta disponible.");
      }

      const producto = new Producto(productData);
      return new DetallePedido({
        producto,
        cantidad: line.cantidad,
        precioUnitario: producto.precioVenta
      });
    });

    const pedido = new Pedido({
      cliente,
      items
    });

    const { id: clienteId } = await this.clienteRepository.insertarCliente(cliente);
    const { id: pedidoId } = await this.pedidoRepository.insertarPedido({
      pedido,
      clienteId
    });

    await Promise.all(
      items.map((item) =>
        this.pedidoRepository.insertarPedidoItem({
          pedidoId,
          item
        })
      )
    );

    return {
      pedidoId,
      clienteId,
      total: pedido.total,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      items: items.map((item) => ({
        productoId: item.producto.id,
        nombre: item.producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal: item.subtotal
      }))
    };
  }

  async obtenerPedidosPorEstado(estadoPedido: string): Promise<AdminOrderSummary[]> {
    const orders = await this.pedidoRepository.buscarPedidosPorEstado(estadoPedido);
    return this.enriquecerPedidosAdmin(orders);
  }

  async obtenerDashboardAdmin(): Promise<AdminDashboardData> {
    const [pendientes, agendados, finalizados, cancelados] = await Promise.all([
      this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_PENDIENTE),
      this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_AGENDADO),
      this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_FINALIZADO),
      this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_CANCELADO)
    ]);
    const enriched = await this.enriquecerPedidosAdmin([
      ...pendientes,
      ...agendados,
      ...finalizados,
      ...cancelados
    ]);

    const byId = new Map(enriched.map((order) => [order.id, order]));
    const finalizadosEnriched = finalizados
      .map((order) => byId.get(order.id))
      .filter((order): order is AdminOrderSummary => Boolean(order))
      .sort((a, b) =>
        (b.fechaCierre ?? b.fechaPedido).localeCompare(a.fechaCierre ?? a.fechaPedido)
      );

    const fiadosPendientes = finalizadosEnriched.filter(
      (order) => order.estadoPago === ESTADO_PAGO_FIADO && order.saldoPendiente > 0
    );

    return {
      pendientes: pendientes
        .map((order) => byId.get(order.id))
        .filter((order): order is AdminOrderSummary => Boolean(order)),
      agendados: agendados
        .map((order) => byId.get(order.id))
        .filter((order): order is AdminOrderSummary => Boolean(order)),
      finalizados: finalizadosEnriched,
      cancelados: cancelados
        .map((order) => byId.get(order.id))
        .filter((order): order is AdminOrderSummary => Boolean(order))
        .sort((a, b) =>
          (b.fechaCancelacion ?? b.fechaPedido).localeCompare(
            a.fechaCancelacion ?? a.fechaPedido
          )
        ),
      fiadosPendientes
    };
  }

  async agendarPedido(pedidoId: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_PENDIENTE);
    const domainPedido = this.mapListItemToPedido(pedido);
    domainPedido.agendar();

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: domainPedido.estadoPedido,
      estadoPago: domainPedido.estadoPago,
      fechaAgendado: domainPedido.fechaAgendado?.toISOString()
    });
  }

  async cancelarPedido(pedidoId: string, motivoCancelacion: string) {
    const pedidos = await Promise.all([
      this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_PENDIENTE),
      this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_AGENDADO)
    ]);
    const pedido = [...pedidos[0], ...pedidos[1]].find((item) => item.id === pedidoId);

    if (!pedido) {
      throw new Error("Pedido no encontrado.");
    }

    const domainPedido = this.mapListItemToPedido(pedido);
    domainPedido.cancelar(motivoCancelacion);

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: ESTADO_PEDIDO_CANCELADO,
      estadoPago: domainPedido.estadoPago,
      fechaAgendado: domainPedido.fechaAgendado?.toISOString(),
      fechaCancelacion: domainPedido.fechaCancelacion?.toISOString(),
      motivoCancelacion: domainPedido.motivoCancelacion
    });
  }

  async marcarPedidoPagado(pedidoId: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_AGENDADO);
    const domainPedido = this.mapListItemToPedido(pedido);
    domainPedido.marcarPagado();

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: domainPedido.estadoPedido,
      estadoPago: ESTADO_PAGO_PAGADO,
      fechaAgendado: domainPedido.fechaAgendado?.toISOString(),
      fechaCierre: domainPedido.fechaCierre?.toISOString()
    });
    await this.pedidoRepository.insertarPago({
      pedidoId,
      monto: domainPedido.total,
      metodoPago: "EFECTIVO",
      estadoPago: ESTADO_PAGO_PAGADO,
      fechaPago: domainPedido.fechaCierre?.toISOString()
    });
  }

  async marcarPedidoFiado(pedidoId: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_AGENDADO);
    const domainPedido = this.mapListItemToPedido(pedido);
    domainPedido.marcarFiado();

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: domainPedido.estadoPedido,
      estadoPago: ESTADO_PAGO_FIADO,
      fechaAgendado: domainPedido.fechaAgendado?.toISOString(),
      fechaCierre: domainPedido.fechaCierre?.toISOString()
    });
    await this.pedidoRepository.upsertFiado({
      pedidoId,
      clienteId: pedido.clienteId,
      montoPendiente: domainPedido.total,
      estado: "PENDIENTE",
      fechaFiado: domainPedido.fechaCierre?.toISOString()
    });
  }

  async registrarAbonoFiado(
    pedidoId: string,
    monto: number,
    metodoPago = "EFECTIVO"
  ) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_FINALIZADO);

    if (pedido.estadoPago !== ESTADO_PAGO_FIADO) {
      throw new Error("Solo se pueden abonar pedidos fiados.");
    }

    const [fiado] = await this.pedidoRepository.buscarFiadosPorPedidoIds([pedidoId]);

    if (!fiado || fiado.montoPendiente <= 0) {
      throw new Error("No existe deuda pendiente para este pedido.");
    }

    const abono = Math.trunc(monto);

    if (!Number.isFinite(abono) || abono <= 0) {
      throw new Error("El abono debe ser mayor a cero.");
    }

    if (abono > fiado.montoPendiente) {
      throw new Error("El abono no puede superar el saldo pendiente.");
    }

    const fechaPago = new Date().toISOString();
    const saldoPendiente = fiado.montoPendiente - abono;

    await this.pedidoRepository.insertarPago({
      pedidoId,
      monto: abono,
      metodoPago,
      estadoPago: saldoPendiente === 0 ? ESTADO_PAGO_PAGADO : ESTADO_PAGO_FIADO,
      fechaPago
    });

    await this.pedidoRepository.upsertFiado({
      pedidoId,
      clienteId: pedido.clienteId,
      montoPendiente: saldoPendiente,
      estado: saldoPendiente === 0 ? "PAGADO" : "PENDIENTE",
      fechaFiado: fiado.fechaFiado,
      fechaPagoFiado: saldoPendiente === 0 ? fechaPago : undefined
    });

    if (saldoPendiente === 0) {
      await this.pedidoRepository.actualizarEstadoPedido({
        pedidoId,
        estadoPedido: ESTADO_PEDIDO_FINALIZADO,
        estadoPago: ESTADO_PAGO_PAGADO,
        fechaAgendado: pedido.fechaAgendado,
        fechaCierre: pedido.fechaCierre ?? fechaPago
      });
    }
  }

  private async obtenerPedidoUnico(pedidoId: string, estadoPedido: string) {
    const orders = await this.pedidoRepository.buscarPedidosPorEstado(estadoPedido);
    const pedido = orders.find((item) => item.id === pedidoId);

    if (!pedido) {
      throw new Error("Pedido no encontrado.");
    }

    return pedido;
  }

  private mapListItemToPedido(order: AdminOrderSummary | PedidoListItemRecord) {
    const cliente = new Cliente({
      id: order.clienteId,
      nombre: order.clienteNombre,
      telefono: order.clienteTelefono,
      lugarTrabajo: order.clienteLugarTrabajo
    });

    const producto = new Producto({
      id: order.productoId,
      nombre: order.productoNombre,
      precioVenta: order.precioUnitario,
      activo: true
    });
    const sourceItems = order.items.length > 0
      ? order.items
      : [
          {
            productoId: order.productoId,
            productoNombre: order.productoNombre,
            cantidad: order.cantidad,
            precioUnitario: order.precioUnitario,
            subtotal: order.subtotal
          }
        ];
    const items = sourceItems.map((currentItem) => {
      const currentProduct =
        currentItem.productoId === producto.id
          ? producto
          : new Producto({
              id: currentItem.productoId,
              nombre: currentItem.productoNombre,
              precioVenta: currentItem.precioUnitario,
              activo: true
            });

      return new DetallePedido({
        producto: currentProduct,
        cantidad: currentItem.cantidad,
        precioUnitario: currentItem.precioUnitario
      });
    });

    return new Pedido({
      id: order.id,
      cliente,
      items,
      estadoPedido: order.estadoPedido,
      estadoPago: order.estadoPago,
      fechaPedido: new Date(order.fechaPedido),
      fechaAgendado: order.fechaAgendado ? new Date(order.fechaAgendado) : undefined,
      fechaCierre: order.fechaCierre ? new Date(order.fechaCierre) : undefined,
      fechaCancelacion: order.fechaCancelacion
        ? new Date(order.fechaCancelacion)
        : undefined,
      motivoCancelacion: order.motivoCancelacion
    });
  }

  private async enriquecerPedidosAdmin(
    orders: Array<AdminOrderSummary | PedidoListItemRecord>
  ): Promise<AdminOrderSummary[]> {
    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order.id);
    const [payments, fiados] = await Promise.all([
      this.pedidoRepository.buscarPagosPorPedidoIds(orderIds),
      this.pedidoRepository.buscarFiadosPorPedidoIds(orderIds)
    ]);

    const paymentsByOrderId = new Map<string, typeof payments>();
    payments.forEach((payment) => {
      const current = paymentsByOrderId.get(payment.pedidoId) ?? [];
      current.push(payment);
      paymentsByOrderId.set(payment.pedidoId, current);
    });

    const fiadosByOrderId = new Map(fiados.map((fiado) => [fiado.pedidoId, fiado]));

    return orders.map((order) => {
      const currentPayments = paymentsByOrderId.get(order.id) ?? [];
      const currentFiado = fiadosByOrderId.get(order.id);
      const totalPagado = currentPayments.reduce((sum, payment) => sum + payment.monto, 0);
      const fechaUltimoPago =
        currentPayments
          .slice()
          .sort((a, b) => b.fechaPago.localeCompare(a.fechaPago))[0]?.fechaPago ??
        undefined;

      return {
        ...order,
        totalPagado:
          order.estadoPago === ESTADO_PAGO_PAGADO && totalPagado === 0
            ? order.total
            : totalPagado,
        saldoPendiente:
          currentFiado?.montoPendiente ??
          (order.estadoPago === ESTADO_PAGO_FIADO ? order.total - totalPagado : 0),
        pagosRegistrados: currentPayments.length,
        fechaUltimoPago,
        fiadoEstado: currentFiado?.estado,
        fechaFiado: currentFiado?.fechaFiado,
        fechaPagoFiado: currentFiado?.fechaPagoFiado
      };
    });
  }
}

export function createPedidoService() {
  return new PedidoService(
    getProductRepository(),
    getClienteRepository(),
    getPedidoRepository()
  );
}
