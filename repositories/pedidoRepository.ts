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
  estadoPedido: string;
  estadoPago: string;
  total: number;
  fechaPedido: string;
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
  }): Promise<{ id: string }>;
  insertarPedidoItem(args: {
    pedidoId: string;
    item: DetallePedido;
  }): Promise<{ id: string }>;
  buscarPedidosPorEstado(estadoPedido: string): Promise<PedidoListItemRecord[]>;
  actualizarEstadoPedido(args: {
    pedidoId: string;
    estadoPedido: string;
    estadoPago?: string;
    fechaAgendado?: string;
    fechaCierre?: string;
    fechaCancelacion?: string;
    motivoCancelacion?: string;
  }): Promise<void>;
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
  async insertarPedido({ pedido, clienteId }: { pedido: Pedido; clienteId: string }) {
    const id = crypto.randomUUID();
    localStore.orders.push({
      id,
      clienteId,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      total: pedido.total,
      fechaPedido: pedido.fechaPedido.toISOString()
    });

    return { id };
  }

  async insertarPedidoItem(args: { pedidoId: string; item: DetallePedido }) {
    const id = crypto.randomUUID();
    localStore.orderItems.push({
      id,
      pedidoId: args.pedidoId,
      productoId: args.item.producto.id,
      cantidad: args.item.cantidad,
      precioUnitario: args.item.precioUnitario,
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
        const orderItem = localStore.orderItems.find(
          (item) => item.pedidoId === order.id
        );
        const product = localStore.products.find(
          (item) => item.id === orderItem?.productoId
        );

        if (!customer || !orderItem || !product) {
          throw new Error("El pedido local esta inconsistente.");
        }

        return {
          id: order.id,
          clienteId: order.clienteId,
          clienteNombre: customer.nombre,
          clienteTelefono: customer.telefono,
          clienteLugarTrabajo: customer.lugarTrabajo,
          productoId: product.id,
          productoNombre: product.nombre,
          cantidad: orderItem.cantidad,
          precioUnitario: orderItem.precioUnitario,
          subtotal: orderItem.subtotal,
          estadoPedido: order.estadoPedido,
          estadoPago: order.estadoPago,
          total: order.total,
          fechaPedido: order.fechaPedido,
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
    order.fechaAgendado = args.fechaAgendado;
    order.fechaCierre = args.fechaCierre;
    order.fechaCancelacion = args.fechaCancelacion;
    order.motivoCancelacion = args.motivoCancelacion;
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
  async insertarPedido({ pedido, clienteId }: { pedido: Pedido; clienteId: string }) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: clienteId,
        estado_pedido: pedido.estadoPedido,
        estado_pago: pedido.estadoPago,
        total: pedido.total,
        fecha_pedido: pedido.fechaPedido.toISOString()
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error("No fue posible registrar el pedido.");
    }

    return { id: data.id };
  }

  async insertarPedidoItem(args: { pedidoId: string; item: DetallePedido }) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pedido_items")
      .insert({
        pedido_id: args.pedidoId,
        producto_id: args.item.producto.id,
        cantidad: args.item.cantidad,
        precio_unitario: args.item.precioUnitario,
        subtotal: args.item.subtotal
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error("No fue posible registrar el item del pedido.");
    }

    return { id: data.id };
  }

  async buscarPedidosPorEstado(estadoPedido: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("pedidos")
      .select(
        `
        id,
        cliente_id,
        estado_pedido,
        estado_pago,
        total,
        fecha_pedido,
        fecha_agendado,
        fecha_cierre,
        fecha_cancelacion,
        motivo_cancelacion,
        clientes:cliente_id (nombre, telefono, lugar_trabajo),
        pedido_items (cantidad, precio_unitario, subtotal, producto_id, productos:producto_id (nombre))
      `
      )
      .eq("estado_pedido", estadoPedido)
      .order("fecha_pedido", { ascending: true });

    if (error) {
      throw new Error("No fue posible obtener los pedidos.");
    }

    return data.map((order) => {
      const customer = Array.isArray(order.clientes) ? order.clientes[0] : order.clientes;
      const firstItem = Array.isArray(order.pedido_items)
        ? order.pedido_items[0]
        : order.pedido_items;
      const product = Array.isArray(firstItem?.productos)
        ? firstItem.productos[0]
        : firstItem?.productos;

      return {
        id: order.id,
        clienteId: order.cliente_id,
        clienteNombre: customer?.nombre ?? "Sin nombre",
        clienteTelefono: customer?.telefono ?? "",
        clienteLugarTrabajo: customer?.lugar_trabajo ?? "",
        productoId: firstItem?.producto_id ?? "",
        productoNombre: product?.nombre ?? "Producto",
        cantidad: firstItem?.cantidad ?? 0,
        precioUnitario: firstItem?.precio_unitario ?? 0,
        subtotal: firstItem?.subtotal ?? 0,
        estadoPedido: order.estado_pedido,
        estadoPago: order.estado_pago,
        total: order.total,
        fechaPedido: order.fecha_pedido,
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
    fechaAgendado?: string;
    fechaCierre?: string;
    fechaCancelacion?: string;
    motivoCancelacion?: string;
  }) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("pedidos")
      .update({
        estado_pedido: args.estadoPedido,
        estado_pago: args.estadoPago,
        fecha_agendado: args.fechaAgendado ?? null,
        fecha_cierre: args.fechaCierre ?? null,
        fecha_cancelacion: args.fechaCancelacion ?? null,
        motivo_cancelacion: args.motivoCancelacion ?? null
      })
      .eq("id", args.pedidoId);

    if (error) {
      throw new Error("No fue posible actualizar el pedido.");
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
