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
  ESTADO_PEDIDO_PENDIENTE
} from "@/lib/constants";
import type {
  AdminOrderSummary,
  CustomerOrderRequest,
  CustomerOrderResponse
} from "@/lib/types";
import { validateCustomerOrderForm } from "@/lib/validators";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import { getClienteRepository } from "@/repositories/clienteRepository";
import type { PedidoRepository } from "@/repositories/pedidoRepository";
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

    const productData = await this.productRepository.buscarProductoPorId(input.productoId);

    if (!productData || productData.activo === false) {
      throw new Error("El producto seleccionado no esta disponible.");
    }

    const cliente = new Cliente({
      nombre: input.nombre,
      telefono: input.telefono,
      lugarTrabajo: input.lugarTrabajo
    });

    const producto = new Producto(productData);
    const item = new DetallePedido({
      producto,
      cantidad: input.cantidad,
      precioUnitario: producto.precioVenta
    });

    const pedido = new Pedido({
      cliente,
      items: [item]
    });

    const { id: clienteId } = await this.clienteRepository.insertarCliente(cliente);
    const { id: pedidoId } = await this.pedidoRepository.insertarPedido({
      pedido,
      clienteId
    });

    await this.pedidoRepository.insertarPedidoItem({
      pedidoId,
      item
    });

    return {
      pedidoId,
      clienteId,
      total: pedido.total,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      producto: {
        id: producto.id,
        nombre: producto.nombre,
        precioUnitario: producto.precioVenta
      }
    };
  }

  async obtenerPedidosPorEstado(estadoPedido: string): Promise<AdminOrderSummary[]> {
    return this.pedidoRepository.buscarPedidosPorEstado(estadoPedido);
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
  }

  private async obtenerPedidoUnico(pedidoId: string, estadoPedido: string) {
    const orders = await this.pedidoRepository.buscarPedidosPorEstado(estadoPedido);
    const pedido = orders.find((item) => item.id === pedidoId);

    if (!pedido) {
      throw new Error("Pedido no encontrado.");
    }

    return pedido;
  }

  private mapListItemToPedido(order: AdminOrderSummary) {
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

    const item = new DetallePedido({
      producto,
      cantidad: order.cantidad,
      precioUnitario: order.precioUnitario
    });

    return new Pedido({
      id: order.id,
      cliente,
      items: [item],
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
}

export function createPedidoService() {
  return new PedidoService(
    getProductRepository(),
    getClienteRepository(),
    getPedidoRepository()
  );
}
