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
  ESTADO_PAGO_SIN_PAGO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_FINALIZADO,
  ESTADO_PEDIDO_PENDIENTE,
  ORIGEN_PEDIDO_ADMIN_DIRECTO,
  ORIGEN_PEDIDO_PERSONALIZADO,
  ORIGEN_PEDIDO_PUBLICO
} from "@/lib/constants";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import type {
  AdminDirectSaleRequest,
  AdminDashboardData,
  AdminOrderSummary,
  CustomOrderRequest,
  CustomerOrderRequest,
  CustomerOrderResponse
} from "@/lib/types";
import {
  validateAdminDirectSaleForm,
  validateCustomOrderForm,
  validateCustomerOrderForm
} from "@/lib/validators";
import { getNewAdminOrdersCount } from "@/lib/admin/getPendingAdminOrders";
import {
  canSellWithoutBreakingStock,
  getAvailableProductStock,
  shouldDecreaseStock
} from "@/lib/stock";
import { sendPendingOrdersPushToAdmins } from "@/lib/pwa/sendWebPush";
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

    const normalizedPhone = parseChileanMobilePhone(input.telefono);

    if (!normalizedPhone) {
      throw new Error("Ingresa un celular chileno valido. Ejemplo: +56 9 1234 5678.");
    }

    const cliente = new Cliente({
      nombre: input.nombre.trim(),
      telefono: normalizedPhone.e164,
      lugarTrabajo: input.lugarTrabajo.trim()
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const items = input.items.map((line) => {
      const productData = productMap.get(line.productoId);

      if (!productData || productData.activo === false) {
        throw new Error("El producto seleccionado no esta disponible.");
      }

      const stockActual = getAvailableProductStock(productData);

      if (line.cantidad > stockActual) {
        throw new Error(
          `${productData.nombre} solo tiene ${stockActual} disponible(s) por ahora.`
        );
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
      items,
      fechaEntrega: this.parseOptionalFechaEntrega(input.fechaEntrega)
    });

    const { id: clienteId } = await this.clienteRepository.upsertCliente(cliente);
    const { id: pedidoId } = await this.pedidoRepository.insertarPedido({
      pedido,
      clienteId,
      origenPedido: ORIGEN_PEDIDO_PUBLICO
    });

    await Promise.all(
      items.map((item) =>
        this.pedidoRepository.insertarPedidoItem({
          pedidoId,
          item,
          productoId: item.producto.id,
          productoNombre: item.producto.nombre,
          productoDescripcion: item.producto.descripcion,
          productoImageUrl: item.producto.imageUrl,
          productoTipo: item.producto.tipoProducto
        })
      )
    );

    // Descuenta el stock unificado y mantiene ambas columnas sincronizadas.
    await Promise.all(
      items.map((item) => {
        console.log(
          `[Stock] Deduciendo ${item.cantidad} de ${item.producto.nombre} (ID: ${item.producto.id})`
        );
        return this.productRepository.ajustarStockAgenda(item.producto.id, -item.cantidad)
          .then((result) => {
            console.log(`[Stock] Stock actualizado a: ${result.stockAgenda}`);
            return result;
          })
          .catch((err) => {
            console.error(`[Stock] Error al deducir: ${err.message}`);
            throw err;
          });
      })
    );

    await this.notifyPendingOrdersBadgeChange(pedidoId);

    return {
      pedidoId,
      clienteId,
      total: pedido.total,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      origenPedido: ORIGEN_PEDIDO_PUBLICO,
      items: items.map((item) => ({
        productoId: item.producto.id,
        nombre: item.producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        costoUnitario: item.producto.costoUnitario,
        costoTotal: item.producto.costoUnitario * item.cantidad,
        utilidadBruta: item.subtotal - item.producto.costoUnitario * item.cantidad,
        subtotal: item.subtotal
      })),
      fechaEntrega: pedido.fechaEntrega ? toDateOnlyString(pedido.fechaEntrega) : undefined
    };
  }

  async crearVentaDirecta(input: AdminDirectSaleRequest): Promise<CustomerOrderResponse> {
    const products = await this.productRepository.buscarTodosProductos();
    const validation = validateAdminDirectSaleForm(input, products);

    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors)[0] ?? "Formulario invalido.");
    }

    const telefono = input.telefono?.trim()
      ? parseChileanMobilePhone(input.telefono)?.e164 ?? ""
      : "";
    const cliente = new Cliente({
      id: input.clienteId,
      nombre: input.nombre?.trim() || "Cliente ocasional",
      telefono,
      lugarTrabajo: input.lugarTrabajo?.trim() || "Venta directa"
    });

    const productMap = new Map(products.map((product) => [product.id, product]));
    const items = input.items.map((line) => {
      const productData = productMap.get(line.productoId);

      if (!productData) {
        throw new Error("El producto seleccionado no existe.");
      }

      if (!canSellWithoutBreakingStock(productData, line.cantidad)) {
        throw new Error(
          `${productData.nombre} solo tiene ${getAvailableProductStock(productData)} disponible(s) por ahora.`
        );
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
      items,
      estadoPedido: ESTADO_PEDIDO_FINALIZADO,
      estadoPago: input.estadoPago,
      fechaCierre: new Date()
    });

    const { id: clienteId } = await this.clienteRepository.upsertCliente(
      cliente,
      input.clienteId
    );
    const { id: pedidoId } = await this.pedidoRepository.insertarPedido({
      pedido,
      clienteId,
      origenPedido: ORIGEN_PEDIDO_ADMIN_DIRECTO,
      observacion: input.observacion?.trim() || undefined
    });

    await Promise.all(
      items.map((item) =>
        this.pedidoRepository.insertarPedidoItem({
          pedidoId,
          item,
          productoId: item.producto.id,
          productoNombre: item.producto.nombre,
          productoDescripcion: item.producto.descripcion,
          productoImageUrl: item.producto.imageUrl,
          productoTipo: item.producto.tipoProducto
        })
      )
    );

    await Promise.all(
      items.map(async (item) => {
        if (!shouldDecreaseStock(item.producto)) {
          return;
        }

        await this.productRepository.ajustarStockAgenda(item.producto.id, -item.cantidad);
      })
    );

    if (input.estadoPago === ESTADO_PAGO_PAGADO) {
      await this.pedidoRepository.insertarPago({
        pedidoId,
        monto: pedido.total,
        metodoPago: "EFECTIVO",
        estadoPago: ESTADO_PAGO_PAGADO,
        fechaPago: pedido.fechaCierre?.toISOString()
      });
    }

    if (input.estadoPago === ESTADO_PAGO_FIADO) {
      await this.pedidoRepository.upsertFiado({
        pedidoId,
        clienteId,
        montoPendiente: pedido.total,
        estado: "PENDIENTE",
        fechaFiado: pedido.fechaCierre?.toISOString()
      });
    }

    return {
      pedidoId,
      clienteId,
      total: pedido.total,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      origenPedido: ORIGEN_PEDIDO_ADMIN_DIRECTO,
      items: items.map((item) => ({
        productoId: item.producto.id,
        nombre: item.producto.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        costoUnitario: item.producto.costoUnitario,
        costoTotal: item.producto.costoUnitario * item.cantidad,
        utilidadBruta: item.subtotal - item.producto.costoUnitario * item.cantidad,
        subtotal: item.subtotal
      }))
    };
  }

  async crearPedidoPersonalizado(input: CustomOrderRequest): Promise<CustomerOrderResponse> {
    const products = await this.productRepository.buscarTodosProductos();
    const validation = validateCustomOrderForm(input, products);

    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors)[0] ?? "Formulario invalido.");
    }

    const telefono = input.telefono?.trim()
      ? parseChileanMobilePhone(input.telefono)?.e164 ?? ""
      : "";
    const cliente = new Cliente({
      id: input.clienteId,
      nombre: input.nombre.trim(),
      telefono,
      lugarTrabajo: input.lugarTrabajo?.trim() || "Pedido personalizado"
    });
    const linkedProduct = input.productoBaseId
      ? products.find((product) => product.id === input.productoBaseId)
      : undefined;
    const producto = new Producto({
      id: linkedProduct?.id ?? "pedido-personalizado",
      nombre: input.nombreProducto.trim(),
      descripcion: input.descripcion?.trim() || "",
      precioVenta: input.precioAcordado,
      imageUrl: linkedProduct?.imageUrl || "/images/products/pedido-personalizado.png",
      badgeLabel: linkedProduct ? "PERSONALIZADO VINCULADO" : "PEDIDO PERSONALIZADO",
      costoUnitario:
        input.costoEstimadoTotal && input.cantidad > 0
          ? Math.round(input.costoEstimadoTotal / input.cantidad)
          : linkedProduct?.costoUnitario ?? 0,
      activo: true,
      tipoProducto: linkedProduct ? "personalizado-vinculado" : "personalizado"
    });
    const item = new DetallePedido({
      producto,
      cantidad: input.cantidad,
      precioUnitario: input.precioAcordado
    });

    const estadoPedido =
      input.estadoInicial === ESTADO_PEDIDO_AGENDADO
        ? ESTADO_PEDIDO_AGENDADO
        : input.estadoInicial === ESTADO_PEDIDO_PENDIENTE
          ? ESTADO_PEDIDO_PENDIENTE
          : ESTADO_PEDIDO_FINALIZADO;
    const estadoPago =
      input.estadoInicial === ESTADO_PEDIDO_AGENDADO ||
      input.estadoInicial === ESTADO_PEDIDO_PENDIENTE
        ? ESTADO_PAGO_SIN_PAGO
        : input.estadoInicial === ESTADO_PAGO_PAGADO
          ? ESTADO_PAGO_PAGADO
          : ESTADO_PAGO_FIADO;
    const fechaEntrega =
      input.fechaEntrega && /^\d{4}-\d{2}-\d{2}$/.test(input.fechaEntrega)
        ? new Date(`${input.fechaEntrega}T00:00:00`)
        : undefined;
    const fechaCierre = estadoPedido === ESTADO_PEDIDO_FINALIZADO ? new Date() : undefined;
    const fechaAgendado = estadoPedido === ESTADO_PEDIDO_AGENDADO ? new Date() : undefined;

    const pedido = new Pedido({
      cliente,
      items: [item],
      estadoPedido,
      estadoPago,
      fechaEntrega,
      fechaAgendado,
      fechaCierre,
      motivoCancelacion: undefined
    });

    const { id: clienteId } = await this.clienteRepository.upsertCliente(
      cliente,
      input.clienteId
    );
    const observationParts = [input.descripcion?.trim(), input.costoEstimadoTotal !== undefined
      ? `Costo estimado total: ${input.costoEstimadoTotal}`
      : undefined].filter(Boolean);
    const { id: pedidoId } = await this.pedidoRepository.insertarPedido({
      pedido,
      clienteId,
      origenPedido: ORIGEN_PEDIDO_PERSONALIZADO,
      observacion: observationParts.join(" | ") || undefined
    });

    await this.pedidoRepository.insertarPedidoItem({
      pedidoId,
      item,
      productoId: linkedProduct?.id,
      productoNombre: producto.nombre,
      productoDescripcion: producto.descripcion,
      productoImageUrl: producto.imageUrl,
      productoTipo: producto.tipoProducto
    });

    if (linkedProduct && shouldDecreaseStock(linkedProduct)) {
      await this.productRepository.ajustarStockAgenda(linkedProduct.id, -item.cantidad);
    }

    if (estadoPago === ESTADO_PAGO_PAGADO) {
      await this.pedidoRepository.insertarPago({
        pedidoId,
        monto: pedido.total,
        metodoPago: "EFECTIVO",
        estadoPago: ESTADO_PAGO_PAGADO,
        fechaPago: fechaCierre?.toISOString()
      });
    }

    if (estadoPago === ESTADO_PAGO_FIADO) {
      await this.pedidoRepository.upsertFiado({
        pedidoId,
        clienteId,
        montoPendiente: pedido.total,
        estado: "PENDIENTE",
        fechaFiado: fechaCierre?.toISOString()
      });
    }

    if (estadoPedido === ESTADO_PEDIDO_PENDIENTE) {
      await this.notifyPendingOrdersBadgeChange(pedidoId);
    }

    return {
      pedidoId,
      clienteId,
      total: pedido.total,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      origenPedido: ORIGEN_PEDIDO_PERSONALIZADO,
      items: [
        {
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          costoUnitario: producto.costoUnitario,
          costoTotal: producto.costoUnitario * item.cantidad,
          utilidadBruta: item.subtotal - producto.costoUnitario * item.cantidad,
          subtotal: item.subtotal
        }
      ]
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

    const pendientesEnriched = pendientes
      .map((order) => byId.get(order.id))
      .filter((order): order is AdminOrderSummary => Boolean(order));
    const agendadosEnriched = agendados
      .map((order) => byId.get(order.id))
      .filter((order): order is AdminOrderSummary => Boolean(order));
    const fiadosPendientes = finalizadosEnriched.filter(
      (order) => order.estadoPago === ESTADO_PAGO_FIADO && order.saldoPendiente > 0
    );
    const pedidosNuevos = getNewAdminOrdersCount(pendientesEnriched);

    return {
      pendientes: pendientesEnriched.sort(
        (a, b) => Number(a.adminSeen === true) - Number(b.adminSeen === true)
      ),
      agendados: agendadosEnriched,
      finalizados: finalizadosEnriched,
      cancelados: cancelados
        .map((order) => byId.get(order.id))
        .filter((order): order is AdminOrderSummary => Boolean(order))
        .sort((a, b) =>
          (b.fechaCancelacion ?? b.fechaPedido).localeCompare(
            a.fechaCancelacion ?? a.fechaPedido
          )
        ),
      fiadosPendientes,
      pedidosNuevos
    };
  }

  async agendarPedido(pedidoId: string, fechaEntrega: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_PENDIENTE);
    const domainPedido = this.mapListItemToPedido(pedido);
    const fechaProgramada = this.parseFechaEntrega(fechaEntrega);

    await this.validarStockAgenda(pedido);
    domainPedido.agendar(fechaProgramada);

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: domainPedido.estadoPedido,
      estadoPago: domainPedido.estadoPago,
      adminSeen: true,
      adminSeenAt: new Date().toISOString(),
      fechaEntrega: toDateOnlyString(fechaProgramada),
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

    // Obtener items del pedido para restaurar stock
    const items = pedido.items || [];

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: ESTADO_PEDIDO_CANCELADO,
      estadoPago: domainPedido.estadoPago,
      fechaAgendado: domainPedido.fechaAgendado?.toISOString(),
      fechaCancelacion: domainPedido.fechaCancelacion?.toISOString(),
      motivoCancelacion: domainPedido.motivoCancelacion
    });

    // Restaurar stock de agenda por cada item
    await this.restoreLinkedCatalogStock(items);
  }

  async marcarPedidoPagado(pedidoId: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_AGENDADO);
    const domainPedido = this.mapListItemToPedido(pedido);
    domainPedido.marcarPagado();

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: domainPedido.estadoPedido,
      estadoPago: ESTADO_PAGO_PAGADO,
      adminSeen: true,
      adminSeenAt: new Date().toISOString(),
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
    const resolvedClienteId = await this.resolveRelatedCustomerId(pedido);

    if (resolvedClienteId && resolvedClienteId !== pedido.clienteId) {
      await this.pedidoRepository.actualizarClientePedido({
        pedidoId,
        clienteId: resolvedClienteId
      });
    }

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: domainPedido.estadoPedido,
      estadoPago: ESTADO_PAGO_FIADO,
      adminSeen: true,
      adminSeenAt: new Date().toISOString(),
      fechaAgendado: domainPedido.fechaAgendado?.toISOString(),
      fechaCierre: domainPedido.fechaCierre?.toISOString()
    });
    await this.pedidoRepository.upsertFiado({
      pedidoId,
      clienteId: resolvedClienteId ?? pedido.clienteId,
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
        adminSeen: true,
        adminSeenAt: new Date().toISOString(),
        fechaAgendado: pedido.fechaAgendado,
        fechaCierre: pedido.fechaCierre ?? fechaPago
      });
    }
  }

  async marcarPedidoVisto(pedidoId: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_PENDIENTE);

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      adminSeen: true,
      adminSeenAt: new Date().toISOString(),
      fechaEntrega: pedido.fechaEntrega,
      fechaAgendado: pedido.fechaAgendado,
      fechaCierre: pedido.fechaCierre,
      fechaCancelacion: pedido.fechaCancelacion,
      motivoCancelacion: pedido.motivoCancelacion
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
            costoUnitario: 0,
            costoTotal: 0,
            utilidadBruta: order.subtotal,
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
              costoUnitario: currentItem.costoUnitario ?? 0,
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
      fechaEntrega: order.fechaEntrega ? new Date(`${order.fechaEntrega}T00:00:00`) : undefined,
      fechaAgendado: order.fechaAgendado ? new Date(order.fechaAgendado) : undefined,
      fechaCierre: order.fechaCierre ? new Date(order.fechaCierre) : undefined,
      fechaCancelacion: order.fechaCancelacion
        ? new Date(order.fechaCancelacion)
        : undefined,
      motivoCancelacion: order.motivoCancelacion
    });
  }

  private async resolveRelatedCustomerId(order: AdminOrderSummary | PedidoListItemRecord) {
    const cliente = new Cliente({
      id: order.clienteId,
      nombre: order.clienteNombre,
      telefono: order.clienteTelefono,
      lugarTrabajo: order.clienteLugarTrabajo || "Pedido personalizado"
    });
    const match = await this.clienteRepository.buscarClienteRelacionado(cliente);
    return match?.id ?? order.clienteId;
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
        totalCost: order.items.reduce(
          (sum, item) =>
            sum + (item.costoTotal ?? (item.costoUnitario ?? 0) * item.cantidad),
          0
        ),
        grossProfit: order.items.reduce(
          (sum, item) =>
            sum +
            (item.utilidadBruta ??
              item.subtotal - (item.costoTotal ?? (item.costoUnitario ?? 0) * item.cantidad)),
          0
        ),
        fechaEntrega: order.fechaEntrega,
        saldoPendiente:
          currentFiado?.montoPendiente ??
          (order.estadoPago === ESTADO_PAGO_FIADO ? order.total - totalPagado : 0),
        pagosRegistrados: currentPayments.length,
        fechaUltimoPago,
        fiadoEstado: currentFiado?.estado,
        fechaFiado: currentFiado?.fechaFiado,
        fechaPagoFiado: currentFiado?.fechaPagoFiado,
        adminSeen: order.adminSeen ?? false,
        adminSeenAt: order.adminSeenAt,
        origenPedido: order.origenPedido as CustomerOrderResponse["origenPedido"],
        observacion: order.observacion
      };
    });
  }

  private parseFechaEntrega(rawValue: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      throw new Error("Selecciona una fecha valida para la entrega.");
    }

    const fecha = new Date(`${rawValue}T00:00:00`);

    if (Number.isNaN(fecha.getTime())) {
      throw new Error("Selecciona una fecha valida para la entrega.");
    }

    return fecha;
  }

  private parseOptionalFechaEntrega(rawValue?: string) {
    if (!rawValue?.trim()) {
      return undefined;
    }

    return this.parseFechaEntrega(rawValue);
  }

  private async validarStockAgenda(
    pedido: PedidoListItemRecord
  ) {
    const productos = await this.productRepository.buscarTodosProductos();

    for (const item of pedido.items) {
      const producto = productos.find((product) => product.id === item.productoId);

      if (!producto) {
        continue;
      }

      const domainProduct = new Producto(producto);
      const stockDisponible = getAvailableProductStock(domainProduct) + item.cantidad;

      if (item.cantidad > stockDisponible) {
        throw new Error(
          `No alcanza el stock disponible para ${domainProduct.nombre}. Disponible: ${Math.max(
            stockDisponible,
            0
          )}.`
        );
      }
    }
  }

  private async reserveLinkedCatalogStock(items: DetallePedido[]) {
    await Promise.all(
      items.map((item) =>
        this.productRepository.ajustarStockAgenda(item.producto.id, -item.cantidad)
      )
    );
  }

  private async restoreLinkedCatalogStock(
    items: Array<{ productoId: string; cantidad: number }>
  ) {
    const settled = await Promise.allSettled(
      items.map(async (item) => {
        if (!item.productoId) {
          return;
        }

        const linkedProduct = await this.productRepository.buscarProductoPorId(item.productoId);

        if (!linkedProduct) {
          return;
        }

        await this.productRepository.ajustarStockAgenda(item.productoId, item.cantidad);
      })
    );

    const firstRejected = settled.find((result) => result.status === "rejected");

    if (firstRejected?.status === "rejected") {
      throw firstRejected.reason;
    }
  }

  private async notifyPendingOrdersBadgeChange(pedidoId?: string) {
    try {
      const pendingOrders = await this.pedidoRepository.buscarPedidosPorEstado(
        ESTADO_PEDIDO_PENDIENTE
      );
      const pendingCount = getNewAdminOrdersCount(pendingOrders);

      await sendPendingOrdersPushToAdmins({
        pendingCount,
        pedidoId
      });
    } catch {
      // No bloquear pedidos por una falla externa de push/badge.
    }
  }
}

function toDateOnlyString(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function createPedidoService() {
  return new PedidoService(
    getProductRepository(),
    getClienteRepository(),
    getPedidoRepository()
  );
}
