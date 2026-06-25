/**
 * Proyecto: Pauli Store
 * Modulo: Repositorio de Pedidos
 * Descripcion: Persistencia de pedidos e items en memoria local o Supabase.
 * Autor: Equipo Pauli Store
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
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteLugarTrabajo: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  items: AdminOrderItemSummary[];
  estadoPedido: string;
  estadoPago: string;
  adminSeen?: boolean;
  adminSeenAt?: string;
  origenPedido?: string;
  total: number;
  observacion?: string;
  fechaPedido: string;
  fechaEntrega?: string;
  fechaAgendado?: string;
  fechaCierre?: string;
  fechaCancelacion?: string;
  motivoCancelacion?: string;
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
  }): Promise<{ id: string }>;
  insertarPedidoItem(args: {
    pedidoId: string;
    item: DetallePedido;
    productoId?: string;
    productoNombre?: string;
    productoDescripcion?: string;
    productoImageUrl?: string;
    productoTipo?: string;
  }): Promise<{ id: string }>;
  buscarPedidosPorEstado(estadoPedido: string): Promise<PedidoListItemRecord[]>;
  actualizarEstadoPedido(args: {
    pedidoId: string;
    estadoPedido: string;
    estadoPago?: string;
    adminSeen?: boolean;
    adminSeenAt?: string;
    fechaEntrega?: string;
    fechaAgendado?: string;
    fechaCierre?: string;
    fechaCancelacion?: string;
    motivoCancelacion?: string;
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
    localStore.orders.push({
      id,
      clienteId,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      adminSeen: false,
      adminSeenAt: undefined,
      origenPedido,
      total: pedido.total,
      observacion,
      fechaPedido: pedido.fechaPedido.toISOString(),
      fechaEntrega: pedido.fechaEntrega?.toISOString().slice(0, 10)
    });

    return { id };
  }

  async insertarPedidoItem(args: {
    pedidoId: string;
    item: DetallePedido;
    productoId?: string;
    productoNombre?: string;
    productoDescripcion?: string;
    productoImageUrl?: string;
    productoTipo?: string;
  }) {
    const id = crypto.randomUUID();
    localStore.orderItems.push({
      id,
      pedidoId: args.pedidoId,
      productoId: args.productoId,
      productoNombre: args.productoNombre,
      productoDescripcion: args.productoDescripcion,
      productoImageUrl: args.productoImageUrl,
      productoTipo: args.productoTipo,
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
        const normalizedItems = orderItems.map((orderItem) => {
          const product = orderItem.productoId
            ? localStore.products.find((item) => item.id === orderItem.productoId)
            : null;

          return {
            productoId: orderItem.productoId ?? `custom-${orderItem.id}`,
            productoNombre: orderItem.productoNombre ?? product?.nombre ?? "Producto",
            cantidad: orderItem.cantidad,
            precioUnitario: orderItem.precioUnitario,
            costoUnitario: orderItem.costoUnitario ?? product?.costoUnitario ?? 0,
            costoTotal:
              orderItem.costoTotal ??
              (orderItem.costoUnitario ?? product?.costoUnitario ?? 0) * orderItem.cantidad,
            utilidadBruta:
              orderItem.utilidadBruta ??
              orderItem.subtotal -
                (orderItem.costoTotal ??
                  (orderItem.costoUnitario ?? product?.costoUnitario ?? 0) * orderItem.cantidad),
            subtotal: orderItem.subtotal
          };
        });
        const firstItem = normalizedItems[0];

        if (!customer || normalizedItems.length === 0) {
          throw new Error("El pedido local esta inconsistente.");
        }

        return {
          id: order.id,
          clienteId: order.clienteId,
          clienteNombre: customer.nombre,
          clienteTelefono: customer.telefono,
          clienteLugarTrabajo: customer.lugarTrabajo,
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
          adminSeen: order.adminSeen ?? false,
          adminSeenAt: order.adminSeenAt,
          origenPedido: order.origenPedido,
          total: order.total,
          observacion: order.observacion,
          fechaPedido: order.fechaPedido,
          fechaEntrega: order.fechaEntrega,
          fechaAgendado: order.fechaAgendado,
          fechaCierre: order.fechaCierre,
          fechaCancelacion: order.fechaCancelacion,
          motivoCancelacion: order.motivoCancelacion
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
    fechaEntrega?: string;
    fechaAgendado?: string;
    fechaCierre?: string;
    fechaCancelacion?: string;
    motivoCancelacion?: string;
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
    order.fechaEntrega = args.fechaEntrega;
    order.fechaAgendado = args.fechaAgendado;
    order.fechaCierre = args.fechaCierre;
    order.fechaCancelacion = args.fechaCancelacion;
    order.motivoCancelacion = args.motivoCancelacion;
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
    let response = await supabase
      .from("pedidos")
      .insert({
        cliente_id: clienteId,
        estado_pedido: pedido.estadoPedido,
        estado_pago: pedido.estadoPago,
        admin_seen: false,
        admin_seen_at: null,
        total: pedido.total,
        observacion: observacion ?? null,
        origen_pedido: origenPedido ?? null,
        fecha_pedido: pedido.fechaPedido.toISOString(),
        fecha_entrega: pedido.fechaEntrega?.toISOString().slice(0, 10) ?? null,
        fecha_agendado: pedido.fechaAgendado?.toISOString() ?? null,
        fecha_cierre: pedido.fechaCierre?.toISOString() ?? null
      })
      .select("id")
      .single();

    if (hasMissingOrdersColumnError(response.error)) {
      response = await supabase
        .from("pedidos")
        .insert({
          cliente_id: clienteId,
          estado_pedido: pedido.estadoPedido,
          estado_pago: pedido.estadoPago,
          total: pedido.total,
          observacion: observacion ?? null,
          fecha_pedido: pedido.fechaPedido.toISOString(),
          fecha_entrega: pedido.fechaEntrega?.toISOString().slice(0, 10) ?? null,
          fecha_agendado: pedido.fechaAgendado?.toISOString() ?? null,
          fecha_cierre: pedido.fechaCierre?.toISOString() ?? null
        })
        .select("id")
        .single();
    }

    if (response.error || !response.data) {
      throw new Error("No fue posible registrar el pedido.");
    }

    return { id: response.data.id };
  }

  async insertarPedidoItem(args: {
    pedidoId: string;
    item: DetallePedido;
    productoId?: string;
    productoNombre?: string;
    productoDescripcion?: string;
    productoImageUrl?: string;
    productoTipo?: string;
  }) {
    const supabase = createSupabaseServerClient();
    let response = await supabase
      .from("pedido_items")
      .insert({
        pedido_id: args.pedidoId,
        producto_id: args.productoId ?? null,
        producto_nombre: args.productoNombre ?? args.item.producto.nombre,
        producto_descripcion: args.productoDescripcion ?? args.item.producto.descripcion,
        producto_image_url: args.productoImageUrl ?? args.item.producto.imageUrl,
        producto_tipo: args.productoTipo ?? args.item.producto.tipoProducto,
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

    if (hasMissingOrderItemsColumnError(response.error)) {
      response = await supabase
        .from("pedido_items")
        .insert({
          pedido_id: args.pedidoId,
          producto_id: args.productoId ?? args.item.producto.id,
          cantidad: args.item.cantidad,
          precio_unitario: args.item.precioUnitario,
          subtotal: args.item.subtotal
        })
        .select("id")
        .single();
    }

    if (response.error || !response.data) {
      throw new Error("No fue posible registrar el item del pedido.");
    }

    return { id: response.data.id };
  }

  async buscarPedidosPorEstado(estadoPedido: string) {
    const supabase = createSupabaseServerClient();
    const extendedResponse = await supabase
      .from("pedidos")
      .select(
        `
        id,
        cliente_id,
        estado_pedido,
        estado_pago,
        admin_seen,
        admin_seen_at,
        total,
        fecha_pedido,
        origen_pedido,
        observacion,
        fecha_entrega,
        fecha_agendado,
        fecha_cierre,
        fecha_cancelacion,
        motivo_cancelacion,
        clientes:cliente_id (nombre, telefono, lugar_trabajo),
        pedido_items (
          cantidad,
          precio_unitario,
          subtotal,
          producto_id,
          producto_nombre,
          costo_unitario,
          total_costo,
          utilidad_bruta,
          productos:producto_id (nombre)
        )
      `
      )
      .eq("estado_pedido", estadoPedido)
      .order("fecha_pedido", { ascending: true });

    const response =
      hasMissingOrdersColumnError(extendedResponse.error) ||
      hasMissingOrderItemsColumnError(extendedResponse.error)
        ? await supabase
        .from("pedidos")
        .select(
          `
          id,
          cliente_id,
          estado_pedido,
          estado_pago,
          total,
          observacion,
          fecha_pedido,
          fecha_entrega,
          fecha_agendado,
          fecha_cierre,
          fecha_cancelacion,
          motivo_cancelacion,
          clientes:cliente_id (nombre, telefono, lugar_trabajo),
          pedido_items (cantidad, precio_unitario, subtotal, producto_id, productos:producto_id (nombre))
        `
        )
        .eq("estado_pedido", estadoPedido)
        .order("fecha_pedido", { ascending: true })
        : extendedResponse;

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
      const normalizedItems = items.map((currentItem) => {
        const product = Array.isArray(currentItem?.productos)
          ? currentItem.productos[0]
          : currentItem?.productos;
        const currentItemWithOverrides = currentItem as {
          producto_nombre?: string | null;
          costo_unitario?: number | null;
          total_costo?: number | null;
          utilidad_bruta?: number | null;
        };

        return {
          productoId: currentItem?.producto_id ?? "",
          productoNombre:
            currentItemWithOverrides.producto_nombre ?? product?.nombre ?? "Producto",
          cantidad: currentItem?.cantidad ?? 0,
          precioUnitario: currentItem?.precio_unitario ?? 0,
          costoUnitario: currentItemWithOverrides.costo_unitario ?? 0,
          costoTotal:
            currentItemWithOverrides.total_costo ??
            (currentItemWithOverrides.costo_unitario ?? 0) * (currentItem?.cantidad ?? 0),
          utilidadBruta:
            currentItemWithOverrides.utilidad_bruta ??
            (currentItem?.subtotal ?? 0) -
              (currentItemWithOverrides.costo_unitario ?? 0) * (currentItem?.cantidad ?? 0),
          subtotal: currentItem?.subtotal ?? 0
        };
      });
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
        clienteId: order.cliente_id,
        clienteNombre: customer?.nombre ?? "Sin nombre",
        clienteTelefono: customer?.telefono ?? "",
        clienteLugarTrabajo: customer?.lugar_trabajo ?? "",
        productoId: firstItem?.productoId ?? "",
        productoNombre: summaryProductName,
        cantidad: totalCantidad,
        precioUnitario: firstItem?.precioUnitario ?? 0,
        subtotal: firstItem?.subtotal ?? 0,
        items: normalizedItems,
        estadoPedido: order.estado_pedido,
        estadoPago: order.estado_pago,
        adminSeen: (order as { admin_seen?: boolean | null }).admin_seen ?? false,
        adminSeenAt: (order as { admin_seen_at?: string | null }).admin_seen_at ?? undefined,
        origenPedido: (order as { origen_pedido?: string | null }).origen_pedido ?? undefined,
        total: order.total,
        observacion: order.observacion ?? undefined,
        fechaPedido: order.fecha_pedido,
        fechaEntrega: order.fecha_entrega ?? undefined,
        fechaAgendado: order.fecha_agendado ?? undefined,
        fechaCierre: order.fecha_cierre ?? undefined,
        fechaCancelacion: order.fecha_cancelacion ?? undefined,
        motivoCancelacion: order.motivo_cancelacion ?? undefined
      };
    });
  }

  async actualizarEstadoPedido(args: {
    pedidoId: string;
    estadoPedido: string;
    estadoPago?: string;
    adminSeen?: boolean;
    adminSeenAt?: string;
    fechaEntrega?: string;
    fechaAgendado?: string;
    fechaCierre?: string;
    fechaCancelacion?: string;
    motivoCancelacion?: string;
  }) {
    const supabase = createSupabaseServerClient();
    let { error } = await supabase
      .from("pedidos")
      .update({
        estado_pedido: args.estadoPedido,
        estado_pago: args.estadoPago,
        admin_seen: args.adminSeen,
        admin_seen_at: args.adminSeenAt ?? null,
        fecha_entrega: args.fechaEntrega ?? null,
        fecha_agendado: args.fechaAgendado ?? null,
        fecha_cierre: args.fechaCierre ?? null,
        fecha_cancelacion: args.fechaCancelacion ?? null,
        motivo_cancelacion: args.motivoCancelacion ?? null
      })
      .eq("id", args.pedidoId);

    if (hasMissingOrdersColumnError(error)) {
      ({ error } = await supabase
        .from("pedidos")
        .update({
          estado_pedido: args.estadoPedido,
          estado_pago: args.estadoPago,
          fecha_entrega: args.fechaEntrega ?? null,
          fecha_agendado: args.fechaAgendado ?? null,
          fecha_cierre: args.fechaCierre ?? null,
          fecha_cancelacion: args.fechaCancelacion ?? null,
          motivo_cancelacion: args.motivoCancelacion ?? null
        })
        .eq("id", args.pedidoId));
    }

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

function hasMissingOrdersColumnError(error: { message?: string; code?: string } | null) {
  return (
    error?.code === "PGRST204" ||
    error?.message?.includes("origen_pedido") === true ||
    error?.message?.includes("admin_seen") === true
  );
}

function hasMissingOrderItemsColumnError(error: { message?: string; code?: string } | null) {
  return (
    error?.code === "PGRST204" ||
    error?.message?.includes("producto_nombre") === true ||
    error?.message?.includes("producto_id") === true ||
    error?.message?.includes("costo_unitario") === true ||
    error?.message?.includes("total_costo") === true ||
    error?.message?.includes("utilidad_bruta") === true
  );
}

export function getPedidoRepository(): PedidoRepository {
  if (isSupabaseConfigured()) {
    return new SupabasePedidoRepository();
  }

  return new MemoryPedidoRepository();
}
