/**
 * Proyecto: Perfume Store
 * Modulo: Repositorio de Pedidos
 * Descripcion: Persistencia de pedidos e items en memoria local o Supabase.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { DetallePedido } from "@/domain/DetallePedido";
import { Pedido } from "@/domain/Pedido";
import type { AdminOrderItemSummary } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PedidoListItemRecord = {
  id: string;
  codigo?: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteLugarTrabajo: string;
  clienteRut?: string;
  clienteEmail?: string;
  clienteRegion?: string;
  clienteComuna?: string;
  clienteDireccion?: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  items: AdminOrderItemSummary[];
  estadoPedido: string;
  estadoPago: string;
  metodoDespacho?: string;
  costoDespacho?: number;
  adminSeen?: boolean;
  adminSeenAt?: string;
  origenPedido?: string;
  total: number;
  observacion?: string;
  fechaPedido: string;
  fechaAgendado?: string;
  fechaPago?: string;
  fechaPreparacion?: string;
  fechaDespacho?: string;
  fechaEntrega?: string;
  fechaCancelacion?: string;
  motivoCancelacion?: string;
  stockRepuesto?: boolean;
};

export type PedidoPagoRecord = {
  id: string;
  pedidoId: string;
  monto: number;
  metodoPago?: string;
  estadoPago: string;
  fechaPago: string;
};

export type PedidoFiadoRecord = {
  id: string;
  pedidoId: string;
  clienteId: string;
  montoPendiente: number;
  estado: string;
  fechaFiado: string;
  fechaPagoFiado?: string;
};

export interface PedidoRepository {
  insertarPedido(args: {
    pedido: Pedido;
    clienteId: string;
    origenPedido?: string;
    observacion?: string;
  }): Promise<{ id: string; codigo?: string }>;
  insertarPedidoItem(args: {
    pedidoId: string;
    item: DetallePedido;
    productoId?: string | null;
  }): Promise<{ id: string }>;
  buscarPedidosPorEstado(estadoPedido: string): Promise<PedidoListItemRecord[]>;
  actualizarEstadoPedido(args: {
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
    motivoCancelacion?: string;
    stockRepuesto?: boolean;
  }): Promise<void>;
  actualizarClientePedido(args: { pedidoId: string; clienteId: string }): Promise<void>;
  buscarPagosPorPedidoIds(pedidoIds: string[]): Promise<PedidoPagoRecord[]>;
  buscarFiadosPorPedidoIds(pedidoIds: string[]): Promise<PedidoFiadoRecord[]>;
  insertarPago(args: {
    pedidoId: string;
    monto: number;
    metodoPago?: string;
    estadoPago: string;
    fechaPago?: string;
  }): Promise<{ id: string }>;
  upsertFiado(args: {
    pedidoId: string;
    clienteId: string;
    montoPendiente: number;
    estado: string;
    fechaFiado?: string;
    fechaPagoFiado?: string;
  }): Promise<void>;
}

class MemoryPedidoRepository implements PedidoRepository {
  async insertarPedido({
    pedido,
    clienteId,
    origenPedido,
    observacion
  }: {
    pedido: Pedido;
    clienteId: string;
    origenPedido?: string;
    observacion?: string;
  }) {
    const id = crypto.randomUUID();
    const codigo = pedido.codigo ?? `PS-${id.slice(0, 8).toUpperCase()}`;

    localStore.orders.push({
      id,
      codigo,
      clienteId,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      origenPedido,
      subtotal: pedido.subtotal,
      metodoDespacho: pedido.metodoDespacho,
      costoDespacho: pedido.costoDespacho,
      total: pedido.total,
      observacion,
      motivoCancelacion: pedido.motivoCancelacion,
      stockRepuesto: pedido.stockRepuesto,
      adminSeen: false,
      adminSeenAt: undefined,
      fechaPedido: pedido.fechaPedido.toISOString(),
      fechaAgendado: pedido.fechaAgendado?.toISOString(),
      fechaPago: pedido.fechaPago?.toISOString(),
      fechaPreparacion: pedido.fechaPreparacion?.toISOString(),
      fechaDespacho: pedido.fechaDespacho?.toISOString(),
      fechaEntrega: pedido.fechaEntrega?.toISOString(),
      fechaCancelacion: pedido.fechaCancelacion?.toISOString()
    });

    return { id, codigo };
  }

  async insertarPedidoItem(args: {
    pedidoId: string;
    item: DetallePedido;
    productoId?: string | null;
  }) {
    const id = crypto.randomUUID();
    localStore.orderItems.push({
      id,
      pedidoId: args.pedidoId,
      productoId: args.productoId ?? args.item.producto.id ?? null,
      productoSku: args.item.producto.sku,
      productoNombre: args.item.producto.nombre,
      productoMarca: args.item.producto.marca,
      productoContenido: args.item.producto.contenido,
      productoDescripcion: args.item.producto.descripcion,
      productoImageUrl: args.item.producto.imageUrl,
      productoTipo: args.item.producto.tipoProducto,
      cantidad: args.item.cantidad,
      precioUnitario: args.item.precioUnitario,
      costoUnitario: args.item.producto.costoUnitario,
      costoTotal: args.item.producto.costoUnitario * args.item.cantidad,
      utilidadBruta:
        args.item.subtotal - args.item.producto.costoUnitario * args.item.cantidad,
      subtotal: args.item.subtotal
    });

    return { id };
  }

  async buscarPedidosPorEstado(estadoPedido: string) {
    return localStore.orders
      .filter((order) => order.estadoPedido === estadoPedido)
      .map((order) => {
        const customer = localStore.customers.find(
          (item) => item.id === order.clienteId
        );
        const orderItems = localStore.orderItems.filter((item) => item.pedidoId === order.id);
        const normalizedItems: AdminOrderItemSummary[] = orderItems.map((orderItem) => ({
          productoId: orderItem.productoId ?? null,
          productoNombre: orderItem.productoNombre ?? "Producto",
          cantidad: orderItem.cantidad,
          precioUnitario: orderItem.precioUnitario,
          costoUnitario: orderItem.costoUnitario ?? 0,
          costoTotal: orderItem.costoTotal ?? orderItem.costoUnitario * orderItem.cantidad,
          utilidadBruta:
            orderItem.utilidadBruta ??
            orderItem.subtotal - orderItem.costoUnitario * orderItem.cantidad,
          subtotal: orderItem.subtotal
        }));
        const firstItem = normalizedItems[0];

        if (!customer || normalizedItems.length === 0) {
          throw new Error("El pedido local esta inconsistente.");
        }

        return {
          id: order.id,
          codigo: order.codigo,
          clienteId: order.clienteId,
          clienteNombre: customer.nombre,
          clienteTelefono: customer.telefono,
          clienteLugarTrabajo: customer.lugarTrabajo,
          clienteRut: customer.rut,
          clienteEmail: customer.email,
          clienteRegion: customer.region,
          clienteComuna: customer.comuna,
          clienteDireccion: customer.direccion,
          productoId: firstItem?.productoId ?? "",
          productoNombre:
            normalizedItems.length > 1
              ? `${normalizedItems.length} productos`
              : firstItem?.productoNombre ?? "Producto",
          cantidad: normalizedItems.reduce((sum, item) => sum + item.cantidad, 0),
          precioUnitario: firstItem?.precioUnitario ?? 0,
          subtotal: firstItem?.subtotal ?? 0,
          items: normalizedItems,
          estadoPedido: order.estadoPedido,
          estadoPago: order.estadoPago,
          metodoDespacho: order.metodoDespacho,
          costoDespacho: order.costoDespacho,
          adminSeen: order.adminSeen ?? false,
          adminSeenAt: order.adminSeenAt,
          origenPedido: order.origenPedido,
          total: order.total,
          observacion: order.observacion,
          fechaPedido: order.fechaPedido,
          fechaAgendado: order.fechaAgendado,
          fechaPago: order.fechaPago,
          fechaPreparacion: order.fechaPreparacion,
          fechaDespacho: order.fechaDespacho,
          fechaEntrega: order.fechaEntrega,
          fechaCancelacion: order.fechaCancelacion,
          motivoCancelacion: order.motivoCancelacion,
          stockRepuesto: order.stockRepuesto
        };
      })
      .sort((a, b) => a.fechaPedido.localeCompare(b.fechaPedido));
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
    motivoCancelacion?: string;
    stockRepuesto?: boolean;
  }) {
    const order = localStore.orders.find((item) => item.id === args.pedidoId);

    if (!order) {
      throw new Error("Pedido no encontrado.");
    }

    order.estadoPedido = args.estadoPedido;
    if (args.estadoPago) {
      order.estadoPago = args.estadoPago;
    }
    if (args.adminSeen !== undefined) {
      order.adminSeen = args.adminSeen;
    }
    if (args.adminSeenAt !== undefined) {
      order.adminSeenAt = args.adminSeenAt;
    }
    if (args.stockRepuesto !== undefined) {
      order.stockRepuesto = args.stockRepuesto;
    }
    order.fechaAgendado = args.fechaAgendado ?? order.fechaAgendado;
    order.fechaPago = args.fechaPago ?? order.fechaPago;
    order.fechaPreparacion = args.fechaPreparacion ?? order.fechaPreparacion;
    order.fechaDespacho = args.fechaDespacho ?? order.fechaDespacho;
    order.fechaEntrega = args.fechaEntrega ?? order.fechaEntrega;
    order.fechaCancelacion = args.fechaCancelacion ?? order.fechaCancelacion;
    order.motivoCancelacion = args.motivoCancelacion ?? order.motivoCancelacion;
  }

  async actualizarClientePedido(args: { pedidoId: string; clienteId: string }) {
    const order = localStore.orders.find((item) => item.id === args.pedidoId);

    if (!order) {
      throw new Error("Pedido no encontrado.");
    }

    order.clienteId = args.clienteId;
  }

  async buscarPagosPorPedidoIds(pedidoIds: string[]) {
    if (pedidoIds.length === 0) {
      return [];
    }

    return localStore.payments
      .filter((payment) => pedidoIds.includes(payment.pedidoId))
      .map((payment) => ({
        id: payment.id,
        pedidoId: payment.pedidoId,
        monto: payment.monto,
        metodoPago: payment.metodoPago,
        estadoPago: payment.estadoPago,
        fechaPago: payment.fechaPago
      }));
  }

  async buscarFiadosPorPedidoIds(pedidoIds: string[]) {
    if (pedidoIds.length === 0) {
      return [];
    }

    return localStore.fiados
      .filter((fiado) => pedidoIds.includes(fiado.pedidoId))
      .map((fiado) => ({
        id: fiado.id,
        pedidoId: fiado.pedidoId,
        clienteId: fiado.clienteId,
        montoPendiente: fiado.montoPendiente,
        estado: fiado.estado,
        fechaFiado: fiado.fechaFiado,
        fechaPagoFiado: fiado.fechaPagoFiado
      }));
  }

  async insertarPago(args: {
    pedidoId: string;
    monto: number;
    metodoPago?: string;
    estadoPago: string;
    fechaPago?: string;
  }) {
    const id = crypto.randomUUID();
    localStore.payments.push({
      id,
      pedidoId: args.pedidoId,
      monto: args.monto,
      metodoPago: args.metodoPago,
      estadoPago: args.estadoPago,
      fechaPago: args.fechaPago ?? new Date().toISOString()
    });

    return { id };
  }

  async upsertFiado(args: {
    pedidoId: string;
    clienteId: string;
    montoPendiente: number;
    estado: string;
    fechaFiado?: string;
    fechaPagoFiado?: string;
  }) {
    const current = localStore.fiados.find((item) => item.pedidoId === args.pedidoId);

    if (current) {
      current.montoPendiente = args.montoPendiente;
      current.estado = args.estado;
      current.fechaFiado = args.fechaFiado ?? current.fechaFiado;
      current.fechaPagoFiado = args.fechaPagoFiado;
      return;
    }

    localStore.fiados.push({
      id: crypto.randomUUID(),
      pedidoId: args.pedidoId,
      clienteId: args.clienteId,
      montoPendiente: args.montoPendiente,
      estado: args.estado,
      fechaFiado: args.fechaFiado ?? new Date().toISOString(),
      fechaPagoFiado: args.fechaPagoFiado
    });
  }
}

class SupabasePedidoRepository implements PedidoRepository {
  async insertarPedido({
    pedido,
    clienteId,
    origenPedido,
    observacion
  }: {
    pedido: Pedido;
    clienteId: string;
    origenPedido?: string;
    observacion?: string;
  }) {
    const supabase = createSupabaseServerClient();
    const payload: Record<string, unknown> = {
      cliente_id: clienteId,
      estado_pedido: pedido.estadoPedido,
      estado_pago: pedido.estadoPago,
      origen_pedido: origenPedido ?? "PUBLICO",
      subtotal: pedido.subtotal,
      metodo_despacho: pedido.metodoDespacho,
      costo_despacho: pedido.costoDespacho,
      total: pedido.total,
      observacion: observacion ?? null,
      stock_repuesto: pedido.stockRepuesto,
      fecha_pedido: pedido.fechaPedido.toISOString(),
      fecha_agendado: pedido.fechaAgendado?.toISOString() ?? null,
      fecha_pago: pedido.fechaPago?.toISOString() ?? null,
      fecha_preparacion: pedido.fechaPreparacion?.toISOString() ?? null,
      fecha_despacho: pedido.fechaDespacho?.toISOString() ?? null,
      fecha_entrega: pedido.fechaEntrega?.toISOString() ?? null
    };

    if (pedido.codigo) {
      payload.codigo = pedido.codigo;
    }

    const response = await supabase.from("pedidos").insert(payload).select("id, codigo").single();

    if (response.error || !response.data) {
      throw new Error(
        `No fue posible registrar el pedido. ${response.error?.message ?? ""}`.trim()
      );
    }

    return { id: response.data.id, codigo: response.data.codigo ?? undefined };
  }

  async insertarPedidoItem(args: {
    pedidoId: string;
    item: DetallePedido;
    productoId?: string | null;
  }) {
    const supabase = createSupabaseServerClient();
    const response = await supabase
      .from("pedido_items")
      .insert({
        pedido_id: args.pedidoId,
        producto_id: args.productoId ?? args.item.producto.id ?? null,
        producto_sku: args.item.producto.sku || null,
        producto_nombre: args.item.producto.nombre,
        producto_marca: args.item.producto.marca || null,
        producto_contenido: args.item.producto.contenido || null,
        producto_descripcion: args.item.producto.descripcion,
        producto_image_url: args.item.producto.imageUrl,
        producto_tipo: args.item.producto.tipoProducto,
        cantidad: args.item.cantidad,
        precio_unitario: args.item.precioUnitario,
        costo_unitario: args.item.producto.costoUnitario,
        total_costo: args.item.producto.costoUnitario * args.item.cantidad,
        utilidad_bruta:
          args.item.subtotal - args.item.producto.costoUnitario * args.item.cantidad,
        subtotal: args.item.subtotal
      })
      .select("id")
      .single();

    if (response.error || !response.data) {
      throw new Error("No fue posible registrar el item del pedido.");
    }

    return { id: response.data.id };
  }

  async buscarPedidosPorEstado(estadoPedido: string) {
    const supabase = createSupabaseServerClient();
    const response = await supabase
      .from("pedidos")
      .select(
        `
        id,
        codigo,
        cliente_id,
        estado_pedido,
        estado_pago,
        metodo_despacho,
        costo_despacho,
        admin_seen,
        admin_seen_at,
        total,
        subtotal,
        fecha_pedido,
        origen_pedido,
        observacion,
        fecha_agendado,
        fecha_pago,
        fecha_preparacion,
        fecha_despacho,
        fecha_entrega,
        fecha_cancelacion,
        motivo_cancelacion,
        stock_repuesto,
        clientes:cliente_id (nombre, telefono, lugar_trabajo, rut, email, region, comuna, direccion),
        pedido_items (
          cantidad,
          precio_unitario,
          subtotal,
          producto_id,
          producto_nombre,
          costo_unitario,
          total_costo,
          utilidad_bruta
        )
      `
      )
      .eq("estado_pedido", estadoPedido)
      .order("fecha_pedido", { ascending: true });

    if (response.error) {
      throw new Error("No fue posible obtener los pedidos.");
    }

    return response.data.map((order) => {
      const customer = Array.isArray(order.clientes) ? order.clientes[0] : order.clientes;
      const items = Array.isArray(order.pedido_items)
        ? order.pedido_items
        : order.pedido_items
          ? [order.pedido_items]
          : [];
      const normalizedItems: AdminOrderItemSummary[] = items.map((currentItem) => ({
        productoId: currentItem?.producto_id ?? null,
        productoNombre: currentItem?.producto_nombre ?? "Producto",
        cantidad: currentItem?.cantidad ?? 0,
        precioUnitario: currentItem?.precio_unitario ?? 0,
        costoUnitario: currentItem?.costo_unitario ?? 0,
        costoTotal:
          currentItem?.total_costo ??
          (currentItem?.costo_unitario ?? 0) * (currentItem?.cantidad ?? 0),
        utilidadBruta:
          currentItem?.utilidad_bruta ??
          (currentItem?.subtotal ?? 0) -
            (currentItem?.costo_unitario ?? 0) * (currentItem?.cantidad ?? 0),
        subtotal: currentItem?.subtotal ?? 0
      }));
      const firstItem = normalizedItems[0];
      const totalCantidad = normalizedItems.reduce(
        (sum, currentItem) => sum + currentItem.cantidad,
        0
      );
      const summaryProductName =
        normalizedItems.length <= 1
          ? firstItem?.productoNombre ?? "Producto"
          : `${normalizedItems.length} productos`;

      return {
        id: order.id,
        codigo: order.codigo ?? undefined,
        clienteId: order.cliente_id,
        clienteNombre: customer?.nombre ?? "Sin nombre",
        clienteTelefono: customer?.telefono ?? "",
        clienteLugarTrabajo: customer?.lugar_trabajo ?? "",
        clienteRut: customer?.rut ?? undefined,
        clienteEmail: customer?.email ?? undefined,
        clienteRegion: customer?.region ?? undefined,
        clienteComuna: customer?.comuna ?? undefined,
        clienteDireccion: customer?.direccion ?? undefined,
        productoId: firstItem?.productoId ?? "",
        productoNombre: summaryProductName,
        cantidad: totalCantidad,
        precioUnitario: firstItem?.precioUnitario ?? 0,
        subtotal: firstItem?.subtotal ?? 0,
        items: normalizedItems,
        estadoPedido: order.estado_pedido,
        estadoPago: order.estado_pago,
        metodoDespacho: order.metodo_despacho ?? undefined,
        costoDespacho: order.costo_despacho ?? undefined,
        adminSeen: order.admin_seen ?? false,
        adminSeenAt: order.admin_seen_at ?? undefined,
        origenPedido: order.origen_pedido ?? undefined,
        total: order.total,
        observacion: order.observacion ?? undefined,
        fechaPedido: order.fecha_pedido,
        fechaAgendado: order.fecha_agendado ?? undefined,
        fechaPago: order.fecha_pago ?? undefined,
        fechaPreparacion: order.fecha_preparacion ?? undefined,
        fechaDespacho: order.fecha_despacho ?? undefined,
        fechaEntrega: order.fecha_entrega ?? undefined,
        fechaCancelacion: order.fecha_cancelacion ?? undefined,
        motivoCancelacion: order.motivo_cancelacion ?? undefined,
        stockRepuesto: order.stock_repuesto ?? false
      };
    });
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
    motivoCancelacion?: string;
    stockRepuesto?: boolean;
  }) {
    const supabase = createSupabaseServerClient();
    const payload: Record<string, unknown> = {
      estado_pedido: args.estadoPedido
    };

    if (args.estadoPago !== undefined) payload.estado_pago = args.estadoPago;
    if (args.adminSeen !== undefined) payload.admin_seen = args.adminSeen;
    if (args.adminSeenAt !== undefined) payload.admin_seen_at = args.adminSeenAt;
    if (args.fechaAgendado !== undefined) payload.fecha_agendado = args.fechaAgendado;
    if (args.fechaPago !== undefined) payload.fecha_pago = args.fechaPago;
    if (args.fechaPreparacion !== undefined) payload.fecha_preparacion = args.fechaPreparacion;
    if (args.fechaDespacho !== undefined) payload.fecha_despacho = args.fechaDespacho;
    if (args.fechaEntrega !== undefined) payload.fecha_entrega = args.fechaEntrega;
    if (args.fechaCancelacion !== undefined) payload.fecha_cancelacion = args.fechaCancelacion;
    if (args.motivoCancelacion !== undefined) payload.motivo_cancelacion = args.motivoCancelacion;
    if (args.stockRepuesto !== undefined) payload.stock_repuesto = args.stockRepuesto;

    const { error } = await supabase.from("pedidos").update(payload).eq("id", args.pedidoId);

    if (error) {
      throw new Error("No fue posible actualizar el pedido.");
    }
  }

  async actualizarClientePedido(args: { pedidoId: string; clienteId: string }) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("pedidos")
      .update({
        cliente_id: args.clienteId
      })
      .eq("id", args.pedidoId);

    if (error) {
      throw new Error("No fue posible actualizar el cliente del pedido.");
    }
  }

  async buscarPagosPorPedidoIds(pedidoIds: string[]) {
    if (pedidoIds.length === 0) {
      return [];
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pagos")
      .select("id, pedido_id, monto, metodo_pago, estado_pago, fecha_pago")
      .in("pedido_id", pedidoIds)
      .order("fecha_pago", { ascending: false });

    if (error) {
      throw new Error("No fue posible obtener pagos.");
    }

    return data.map((payment) => ({
      id: payment.id,
      pedidoId: payment.pedido_id,
      monto: payment.monto,
      metodoPago: payment.metodo_pago ?? undefined,
      estadoPago: payment.estado_pago,
      fechaPago: payment.fecha_pago
    }));
  }

  async buscarFiadosPorPedidoIds(pedidoIds: string[]) {
    if (pedidoIds.length === 0) {
      return [];
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("fiados")
      .select(
        "id, pedido_id, cliente_id, monto_pendiente, estado, fecha_fiado, fecha_pago_fiado"
      )
      .in("pedido_id", pedidoIds);

    if (error) {
      throw new Error("No fue posible obtener fiados.");
    }

    return data.map((fiado) => ({
      id: fiado.id,
      pedidoId: fiado.pedido_id,
      clienteId: fiado.cliente_id,
      montoPendiente: fiado.monto_pendiente,
      estado: fiado.estado,
      fechaFiado: fiado.fecha_fiado,
      fechaPagoFiado: fiado.fecha_pago_fiado ?? undefined
    }));
  }

  async insertarPago(args: {
    pedidoId: string;
    monto: number;
    metodoPago?: string;
    estadoPago: string;
    fechaPago?: string;
  }) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pagos")
      .insert({
        pedido_id: args.pedidoId,
        monto: args.monto,
        metodo_pago: args.metodoPago ?? null,
        estado_pago: args.estadoPago,
        fecha_pago: args.fechaPago ?? new Date().toISOString()
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error("No fue posible registrar el pago.");
    }

    return { id: data.id };
  }

  async upsertFiado(args: {
    pedidoId: string;
    clienteId: string;
    montoPendiente: number;
    estado: string;
    fechaFiado?: string;
    fechaPagoFiado?: string;
  }) {
    const supabase = createSupabaseServerClient();
    const { data: existing, error: readError } = await supabase
      .from("fiados")
      .select("id, fecha_fiado")
      .eq("pedido_id", args.pedidoId)
      .maybeSingle();

    if (readError) {
      throw new Error("No fue posible consultar el fiado.");
    }

    const payload = {
      pedido_id: args.pedidoId,
      cliente_id: args.clienteId,
      monto_pendiente: args.montoPendiente,
      estado: args.estado,
      fecha_fiado:
        args.fechaFiado ?? existing?.fecha_fiado ?? new Date().toISOString(),
      fecha_pago_fiado: args.fechaPagoFiado ?? null
    };

    const query = existing?.id
      ? supabase.from("fiados").update(payload).eq("id", existing.id)
      : supabase.from("fiados").insert(payload);

    const { error } = await query;

    if (error) {
      throw new Error("No fue posible actualizar el fiado.");
    }
  }
}

export function getPedidoRepository(): PedidoRepository {
  if (isSupabaseConfigured()) {
    return new SupabasePedidoRepository();
  }

  return new MemoryPedidoRepository();
}
