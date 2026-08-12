/**
 * Proyecto: Perfume Store
 * Modulo: Repositorio de Pedidos
 * Descripcion: Persistencia de pedidos e items en memoria local o Supabase.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 *
 * FASE 1C: la creacion de pedidos publicos y las transiciones de pago/
 * cancelacion/avance de estado ya no descuentan stock con multiples
 * llamadas independientes desde TypeScript. Se delegan por completo a las
 * RPC transaccionales de Postgres (supabase/migrations/
 * 20260724010000_perfume_store_transactional_stock.sql) cuando Supabase
 * esta configurado. La implementacion en memoria (sin Supabase, usada en
 * desarrollo local y en las pruebas) replica la misma logica de forma
 * sincrona sobre localStore: en un runtime de un solo hilo sin I/O real
 * eso es equivalente a atomico para ese caso de uso, pero NO es la
 * proteccion real contra sobreventa concurrente; esa unicamente la da la
 * RPC de Postgres. Ver docs/PERFUME_STORE_TRANSACTIONAL_STOCK.md.
 */

import { DetallePedido } from "@/domain/DetallePedido";
import { Pedido } from "@/domain/Pedido";
import type { AdminOrderItemSummary } from "@/lib/types";
import { DOMICILIO_SEMANAL_COSTO_FALLBACK, isMetodoDespacho } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { PerfumeOrderError, mapPerfumeOrderRpcError } from "@/lib/perfumeOrderErrors";
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

export type ProductoVentaRecord = {
  estadoPedido: string;
  fechaPedido: string;
  fechaPago?: string;
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

export type CrearPedidoTransaccionalCliente = {
  nombre: string;
  rut?: string;
  email?: string;
  telefono?: string;
  region?: string;
  comuna?: string;
  direccion?: string;
  referenciaDireccion?: string;
};

export type CrearPedidoTransaccionalInput = {
  cliente: CrearPedidoTransaccionalCliente;
  items: Array<{ productoId: string; cantidad: number }>;
  metodoDespacho: string;
  observacion?: string;
  origenPedido?: string;
};

export type PedidoTransaccionalItem = {
  productoId: string | null;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  costoTotal: number;
  utilidadBruta: number;
  subtotal: number;
};

export type PedidoTransaccionalResult = {
  pedidoId: string;
  codigo: string;
  clienteId: string;
  subtotal: number;
  costoDespacho: number;
  total: number;
  estadoPedido: string;
  estadoPago: string;
  metodoDespacho: string;
  origenPedido: string;
  items: PedidoTransaccionalItem[];
};

export type PedidoEstadoTransaccionalResult = {
  pedidoId: string;
  estadoPedido: string;
  estadoPago?: string;
};

export type CrearVentaDirectaTransaccionalCliente = {
  nombre?: string;
  rut?: string;
  email?: string;
  telefono?: string;
  lugarTrabajo?: string;
};

export type CrearVentaDirectaTransaccionalInput = {
  cliente: CrearVentaDirectaTransaccionalCliente;
  items: Array<{ productoId: string; cantidad: number }>;
  formaPago: "EFECTIVO" | "TRANSFERENCIA";
  esFiado: boolean;
  observacion?: string;
  idempotencyKey: string;
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
  /**
   * Fase 8 (V2.2.1, eliminacion segura de productos): una fila por cada
   * pedido_items que referencia este producto, con el estado y las fechas
   * del pedido contenedor -- lo minimo que necesita la clasificacion de
   * elegibilidad (bloqueo por pedidos activos / venta en semana abierta).
   * No incluye montos: esta consulta no es para reportes.
   */
  buscarVentasPorProducto(productId: string): Promise<ProductoVentaRecord[]>;
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
  /**
   * Crea cliente, pedido e items y reserva stock en una sola operacion
   * atomica (RPC create_perfume_order_v1 en Supabase). Reemplaza el
   * mecanismo heredado de insertarPedido + insertarPedidoItem + ajustes de
   * stock independientes para el flujo publico de creacion de pedidos.
   */
  crearPedidoTransaccional(input: CrearPedidoTransaccionalInput): Promise<PedidoTransaccionalResult>;
  /**
   * Registra una venta directa (RPC create_direct_sale_v1 en Supabase):
   * cliente + pedido ENTREGADO + items + descuento inmediato de stock +
   * pago o fiado, todo en una sola transaccion. Reemplaza el mecanismo
   * heredado de PedidoService.crearVentaDirecta (upsertCliente +
   * insertarPedido + insertarPedidoItem + ajustarStockAgenda como llamadas
   * independientes sin rollback). Si idempotencyKey ya se uso en una venta
   * anterior, devuelve ese mismo resultado sin volver a escribir nada.
   */
  crearVentaDirectaTransaccional(
    input: CrearVentaDirectaTransaccionalInput
  ): Promise<PedidoTransaccionalResult>;
  /** RPC mark_perfume_order_paid_v1: reduce stock_actual y stock_reservado. */
  marcarPedidoPagadoTransaccional(
    pedidoId: string,
    metodoPago?: string
  ): Promise<PedidoEstadoTransaccionalResult>;
  /** RPC cancel_perfume_order_v1. */
  cancelarPedidoTransaccional(
    pedidoId: string,
    motivo: string,
    confirmarReposicionPagado: boolean
  ): Promise<PedidoEstadoTransaccionalResult>;
  /** RPC advance_perfume_order_status_v1 (PAGADO->PREPARANDO->DESPACHADO->ENTREGADO). */
  avanzarEstadoPedidoTransaccional(
    pedidoId: string,
    nuevoEstado: "PREPARANDO" | "DESPACHADO" | "ENTREGADO"
  ): Promise<PedidoEstadoTransaccionalResult>;
}

function generateInMemoryOrderCode() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `PERF-${year}-${random}`;
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

  async buscarVentasPorProducto(productId: string): Promise<ProductoVentaRecord[]> {
    return localStore.orderItems
      .filter((item) => item.productoId === productId)
      .map((item) => localStore.orders.find((order) => order.id === item.pedidoId))
      .filter((order): order is (typeof localStore.orders)[number] => Boolean(order))
      .map((order) => ({
        estadoPedido: order.estadoPedido,
        fechaPedido: order.fechaPedido,
        fechaPago: order.fechaPago
      }));
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

        // Snapshot-first (hotfix integridad de identidad): un pedido
        // historico debe conservar siempre la identidad con la que fue
        // creado, aunque la ficha cliente cambie despues (edicion admin,
        // o -- el caso del incidente real -- reutilizacion incorrecta por
        // otro pedido). Fallback a la ficha viva SOLO para pedidos legacy
        // creados antes de este hotfix (snapshot undefined).
        return {
          id: order.id,
          codigo: order.codigo,
          clienteId: order.clienteId,
          clienteNombre: order.clienteNombreSnapshot ?? customer.nombre,
          clienteTelefono: order.clienteTelefonoSnapshot ?? customer.telefono,
          clienteLugarTrabajo: customer.lugarTrabajo,
          clienteRut: order.clienteRutSnapshot ?? customer.rut,
          clienteEmail: order.clienteEmailSnapshot ?? customer.email,
          clienteRegion: order.clienteRegionSnapshot ?? customer.region,
          clienteComuna: order.clienteComunaSnapshot ?? customer.comuna,
          clienteDireccion: order.clienteDireccionSnapshot ?? customer.direccion,
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

  async crearPedidoTransaccional(
    input: CrearPedidoTransaccionalInput
  ): Promise<PedidoTransaccionalResult> {
    if (!input.items || input.items.length === 0) {
      throw new PerfumeOrderError("PF001", "El pedido debe tener al menos un producto.");
    }

    const aggregated = new Map<string, number>();

    for (const item of input.items) {
      if (!item.productoId || !Number.isInteger(item.cantidad) || item.cantidad < 1) {
        throw new PerfumeOrderError(
          "PF004",
          "Cada item debe tener producto y cantidad minima de 1."
        );
      }
      aggregated.set(item.productoId, (aggregated.get(item.productoId) ?? 0) + item.cantidad);
    }

    if (!isMetodoDespacho(input.metodoDespacho)) {
      throw new PerfumeOrderError("PF006", "Metodo de despacho invalido.");
    }

    if (!input.cliente.nombre?.trim()) {
      throw new PerfumeOrderError("PF007", "El nombre del cliente es obligatorio.");
    }

    // Orden deterministico por id, en paralelo al bloqueo determinista de
    // la RPC (aqui no protege contra concurrencia real: solo documenta la
    // misma intencion sobre un almacen en memoria de un solo hilo).
    const sortedIds = Array.from(aggregated.keys()).sort();
    const lines: Array<{ product: (typeof localStore.products)[number]; cantidad: number }> = [];
    let subtotal = 0;

    for (const productoId of sortedIds) {
      const product = localStore.products.find((item) => item.id === productoId);

      if (!product) {
        throw new PerfumeOrderError("PF002", "Uno o mas productos del pedido no existen.");
      }

      if (product.activo === false) {
        throw new PerfumeOrderError("PF003", `El producto ${product.nombre} no esta disponible.`);
      }

      const cantidad = aggregated.get(productoId) as number;
      const stockActual = product.stockActual ?? 0;
      const stockReservado = product.stockReservado ?? 0;

      if (stockActual - stockReservado < cantidad) {
        throw new PerfumeOrderError("PF005", `Stock insuficiente para ${product.nombre}.`);
      }

      lines.push({ product, cantidad });
      subtotal += product.precioVenta * cantidad;
    }

    const costoDespacho =
      input.metodoDespacho === "STARKEN_POR_PAGAR" ? 0 : DOMICILIO_SEMANAL_COSTO_FALLBACK;
    const total = subtotal + costoDespacho;

    // Regla de identidad segura (hotfix integridad de identidad, espejo de
    // create_perfume_order_v1 en
    // supabase/migrations/20260816000000_smellme_customer_order_identity_integrity.sql):
    // el checkout publico exige RUT valido, asi que NUNCA se reutiliza un
    // cliente solo porque coincide telefono o solo porque coincide correo.
    // Solo se reutiliza cuando el RUT coincide Y ADEMAS coincide telefono o
    // correo exactos (en ese orden). Si el RUT coincide pero ni telefono ni
    // correo coinciden, es un conflicto de identidad: se crea una ficha
    // cliente nueva en vez de mezclar dos personas distintas.
    let cliente: (typeof localStore.customers)[number] | undefined;

    if (input.cliente.rut) {
      if (input.cliente.telefono) {
        cliente = localStore.customers.find(
          (item) => item.rut === input.cliente.rut && item.telefono === input.cliente.telefono
        );
      }

      if (!cliente && input.cliente.email) {
        cliente = localStore.customers.find(
          (item) => item.rut === input.cliente.rut && item.email === input.cliente.email
        );
      }
    }

    let clienteId: string;

    if (cliente) {
      cliente.nombre = input.cliente.nombre;
      cliente.email = input.cliente.email ?? cliente.email;
      cliente.telefono = input.cliente.telefono ?? cliente.telefono;
      cliente.region = input.cliente.region ?? cliente.region;
      cliente.comuna = input.cliente.comuna ?? cliente.comuna;
      cliente.direccion = input.cliente.direccion ?? cliente.direccion;
      cliente.referenciaDireccion = input.cliente.referenciaDireccion ?? cliente.referenciaDireccion;
      clienteId = cliente.id;
    } else {
      clienteId = crypto.randomUUID();
      localStore.customers.push({
        id: clienteId,
        nombre: input.cliente.nombre,
        rut: input.cliente.rut,
        email: input.cliente.email,
        telefono: input.cliente.telefono ?? "",
        region: input.cliente.region,
        comuna: input.cliente.comuna,
        direccion: input.cliente.direccion,
        referenciaDireccion: input.cliente.referenciaDireccion,
        lugarTrabajo: "",
        createdAt: new Date().toISOString()
      });
    }

    const pedidoId = crypto.randomUUID();
    const codigo = generateInMemoryOrderCode();

    localStore.orders.push({
      id: pedidoId,
      codigo,
      clienteId,
      estadoPedido: "NUEVO",
      estadoPago: "SIN_PAGO",
      origenPedido: input.origenPedido ?? "PUBLICO",
      subtotal,
      metodoDespacho: input.metodoDespacho,
      costoDespacho,
      total,
      observacion: input.observacion,
      stockRepuesto: false,
      adminSeen: false,
      fechaPedido: new Date().toISOString(),
      // Snapshot historico: valores de ESTE pedido, no lo que termine
      // quedando en localStore.customers despues (que puede cambiar si
      // otra persona reutiliza o edita esa misma ficha mas adelante).
      clienteNombreSnapshot: input.cliente.nombre,
      clienteRutSnapshot: input.cliente.rut,
      clienteEmailSnapshot: input.cliente.email,
      clienteTelefonoSnapshot: input.cliente.telefono,
      clienteRegionSnapshot: input.cliente.region,
      clienteComunaSnapshot: input.cliente.comuna,
      clienteDireccionSnapshot: input.cliente.direccion,
      clienteReferenciaDireccionSnapshot: input.cliente.referenciaDireccion
    });

    const responseItems: PedidoTransaccionalItem[] = [];

    for (const line of lines) {
      const itemId = crypto.randomUUID();
      const costoUnitario = line.product.costoUnitario ?? 0;
      const costoTotal = costoUnitario * line.cantidad;
      const itemSubtotal = line.product.precioVenta * line.cantidad;

      localStore.orderItems.push({
        id: itemId,
        pedidoId,
        productoId: line.product.id,
        productoSku: line.product.sku,
        productoNombre: line.product.nombre,
        productoMarca: line.product.marca,
        productoContenido: line.product.contenido,
        productoDescripcion: line.product.descripcion,
        productoImageUrl: line.product.imageUrl,
        productoTipo: line.product.tipoProducto,
        cantidad: line.cantidad,
        precioUnitario: line.product.precioVenta,
        costoUnitario,
        costoTotal,
        utilidadBruta: itemSubtotal - costoTotal,
        subtotal: itemSubtotal
      });

      // Reserva stock: incrementa stockReservado, no toca stockActual.
      // Paralelo directo de create_perfume_order_v1.
      line.product.stockReservado = (line.product.stockReservado ?? 0) + line.cantidad;

      responseItems.push({
        productoId: line.product.id,
        nombre: line.product.nombre,
        cantidad: line.cantidad,
        precioUnitario: line.product.precioVenta,
        costoUnitario,
        costoTotal,
        utilidadBruta: itemSubtotal - costoTotal,
        subtotal: itemSubtotal
      });
    }

    return {
      pedidoId,
      codigo,
      clienteId,
      subtotal,
      costoDespacho,
      total,
      estadoPedido: "NUEVO",
      estadoPago: "SIN_PAGO",
      metodoDespacho: input.metodoDespacho,
      origenPedido: input.origenPedido ?? "PUBLICO",
      items: responseItems
    };
  }

  private buildTransaccionalResultFromExistingOrder(
    order: (typeof localStore.orders)[number]
  ): PedidoTransaccionalResult {
    const items = localStore.orderItems.filter((item) => item.pedidoId === order.id);

    return {
      pedidoId: order.id,
      codigo: order.codigo ?? "",
      clienteId: order.clienteId,
      subtotal: order.subtotal,
      costoDespacho: order.costoDespacho,
      total: order.total,
      estadoPedido: order.estadoPedido,
      estadoPago: order.estadoPago,
      metodoDespacho: order.metodoDespacho ?? "STARKEN_POR_PAGAR",
      origenPedido: order.origenPedido ?? "ADMIN_DIRECTO",
      items: items.map((item) => ({
        productoId: item.productoId ?? null,
        nombre: item.productoNombre ?? "",
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        costoUnitario: item.costoUnitario,
        costoTotal: item.costoTotal,
        utilidadBruta: item.utilidadBruta,
        subtotal: item.subtotal
      }))
    };
  }

  async crearVentaDirectaTransaccional(
    input: CrearVentaDirectaTransaccionalInput
  ): Promise<PedidoTransaccionalResult> {
    const existingOrder = localStore.orders.find(
      (item) => item.idempotencyKey === input.idempotencyKey
    );

    if (existingOrder) {
      return this.buildTransaccionalResultFromExistingOrder(existingOrder);
    }

    if (input.formaPago !== "EFECTIVO" && input.formaPago !== "TRANSFERENCIA") {
      throw new PerfumeOrderError("PF006", "Forma de pago invalida.");
    }

    if (!input.items || input.items.length === 0) {
      throw new PerfumeOrderError("PF001", "La venta debe tener al menos un item.");
    }

    const aggregated = new Map<string, number>();

    for (const item of input.items) {
      if (!item.productoId || !Number.isInteger(item.cantidad) || item.cantidad < 1) {
        throw new PerfumeOrderError(
          "PF004",
          "Cada item debe tener producto y cantidad minima de 1."
        );
      }
      aggregated.set(item.productoId, (aggregated.get(item.productoId) ?? 0) + item.cantidad);
    }

    // Orden deterministico por id, en paralelo al bloqueo determinista de
    // la RPC (aqui no protege contra concurrencia real: solo documenta la
    // misma intencion sobre un almacen en memoria de un solo hilo).
    const sortedIds = Array.from(aggregated.keys()).sort();
    const lines: Array<{ product: (typeof localStore.products)[number]; cantidad: number }> = [];
    let subtotal = 0;

    for (const productoId of sortedIds) {
      const product = localStore.products.find((item) => item.id === productoId);

      if (!product) {
        throw new PerfumeOrderError("PF002", "Uno o mas productos de la venta no existen.");
      }

      if (product.activo === false) {
        throw new PerfumeOrderError("PF003", `El producto ${product.nombre} no esta disponible.`);
      }

      const cantidad = aggregated.get(productoId) as number;
      const stockActual = product.stockActual ?? 0;
      const stockReservado = product.stockReservado ?? 0;

      if (stockActual - stockReservado < cantidad) {
        throw new PerfumeOrderError("PF005", `Stock insuficiente para ${product.nombre}.`);
      }

      lines.push({ product, cantidad });
      subtotal += product.precioVenta * cantidad;
    }

    const total = subtotal;

    let cliente = input.cliente.telefono
      ? localStore.customers.find((item) => item.telefono === input.cliente.telefono)
      : undefined;

    if (!cliente && input.cliente.rut) {
      cliente = localStore.customers.find((item) => item.rut === input.cliente.rut);
    }

    if (!cliente && input.cliente.email) {
      cliente = localStore.customers.find((item) => item.email === input.cliente.email);
    }

    let clienteId: string;

    if (cliente) {
      cliente.nombre = input.cliente.nombre?.trim() || cliente.nombre;
      cliente.rut = input.cliente.rut ?? cliente.rut;
      cliente.email = input.cliente.email ?? cliente.email;
      cliente.telefono = input.cliente.telefono ?? cliente.telefono;
      cliente.lugarTrabajo = input.cliente.lugarTrabajo ?? cliente.lugarTrabajo;
      clienteId = cliente.id;
    } else {
      clienteId = crypto.randomUUID();
      localStore.customers.push({
        id: clienteId,
        nombre: input.cliente.nombre?.trim() || "Cliente ocasional",
        rut: input.cliente.rut,
        email: input.cliente.email,
        telefono: input.cliente.telefono ?? "",
        lugarTrabajo: input.cliente.lugarTrabajo?.trim() || "Venta directa",
        createdAt: new Date().toISOString()
      });
    }

    const pedidoId = crypto.randomUUID();
    const codigo = generateInMemoryOrderCode();
    const now = new Date().toISOString();
    const estadoPago = input.esFiado ? "SIN_PAGO" : "PAGADO";

    localStore.orders.push({
      id: pedidoId,
      codigo,
      clienteId,
      estadoPedido: "ENTREGADO",
      estadoPago,
      origenPedido: "ADMIN_DIRECTO",
      subtotal,
      metodoDespacho: "STARKEN_POR_PAGAR",
      costoDespacho: 0,
      total,
      observacion: input.observacion,
      stockRepuesto: false,
      idempotencyKey: input.idempotencyKey,
      adminSeen: false,
      fechaPedido: now,
      fechaPago: input.esFiado ? undefined : now,
      fechaDespacho: now,
      fechaEntrega: now
    });

    const responseItems: PedidoTransaccionalItem[] = [];

    for (const line of lines) {
      const itemId = crypto.randomUUID();
      const costoUnitario = line.product.costoUnitario ?? 0;
      const costoTotal = costoUnitario * line.cantidad;
      const itemSubtotal = line.product.precioVenta * line.cantidad;

      localStore.orderItems.push({
        id: itemId,
        pedidoId,
        productoId: line.product.id,
        productoSku: line.product.sku,
        productoNombre: line.product.nombre,
        productoMarca: line.product.marca,
        productoContenido: line.product.contenido,
        productoDescripcion: line.product.descripcion,
        productoImageUrl: line.product.imageUrl,
        productoTipo: line.product.tipoProducto,
        cantidad: line.cantidad,
        precioUnitario: line.product.precioVenta,
        costoUnitario,
        costoTotal,
        utilidadBruta: itemSubtotal - costoTotal,
        subtotal: itemSubtotal
      });

      // Descuento inmediato y definitivo: no hay reserva previa que
      // consumir (la venta directa es en el acto). Paralelo directo de
      // create_direct_sale_v1.
      line.product.stockActual = (line.product.stockActual ?? 0) - line.cantidad;
      line.product.stockAgenda = (line.product.stockAgenda ?? 0) - line.cantidad;

      responseItems.push({
        productoId: line.product.id,
        nombre: line.product.nombre,
        cantidad: line.cantidad,
        precioUnitario: line.product.precioVenta,
        costoUnitario,
        costoTotal,
        utilidadBruta: itemSubtotal - costoTotal,
        subtotal: itemSubtotal
      });
    }

    if (input.esFiado) {
      localStore.fiados.push({
        id: crypto.randomUUID(),
        pedidoId,
        clienteId,
        montoPendiente: total,
        estado: "PENDIENTE",
        fechaFiado: now
      });
    } else {
      localStore.payments.push({
        id: crypto.randomUUID(),
        pedidoId,
        monto: total,
        metodoPago: input.formaPago,
        estadoPago: "PAGADO",
        fechaPago: now
      });
    }

    return {
      pedidoId,
      codigo,
      clienteId,
      subtotal,
      costoDespacho: 0,
      total,
      estadoPedido: "ENTREGADO",
      estadoPago,
      metodoDespacho: "STARKEN_POR_PAGAR",
      origenPedido: "ADMIN_DIRECTO",
      items: responseItems
    };
  }

  async marcarPedidoPagadoTransaccional(
    pedidoId: string,
    metodoPago = "TRANSFERENCIA"
  ): Promise<PedidoEstadoTransaccionalResult> {
    const order = localStore.orders.find((item) => item.id === pedidoId);

    if (!order) {
      throw new PerfumeOrderError("PF009", "Pedido no encontrado.");
    }

    if (order.estadoPedido !== "NUEVO" && order.estadoPedido !== "AGENDADO") {
      throw new PerfumeOrderError(
        "PF012",
        "Este pedido no admite marcar pagado en su estado actual."
      );
    }

    if (order.estadoPago !== "SIN_PAGO") {
      throw new PerfumeOrderError("PF010", "Este pedido ya fue pagado.");
    }

    const items = localStore.orderItems.filter((item) => item.pedidoId === pedidoId);

    for (const item of items) {
      if (!item.productoId) {
        continue;
      }

      const product = localStore.products.find((current) => current.id === item.productoId);

      if (!product) {
        throw new PerfumeOrderError("PF002", "Uno de los productos del pedido ya no existe.");
      }

      const stockReservado = product.stockReservado ?? 0;

      if (stockReservado < item.cantidad) {
        throw new PerfumeOrderError(
          "PF015",
          "La reserva de stock de este pedido ya no es valida."
        );
      }
    }

    for (const item of items) {
      if (!item.productoId) {
        continue;
      }

      const product = localStore.products.find((current) => current.id === item.productoId);

      if (!product) {
        continue;
      }

      product.stockActual = (product.stockActual ?? 0) - item.cantidad;
      product.stockReservado = (product.stockReservado ?? 0) - item.cantidad;
    }

    const fechaPago = new Date().toISOString();
    order.estadoPedido = "PAGADO";
    order.estadoPago = "PAGADO";
    order.fechaPago = fechaPago;

    localStore.payments.push({
      id: crypto.randomUUID(),
      pedidoId,
      monto: order.total,
      metodoPago,
      estadoPago: "PAGADO",
      fechaPago
    });

    return { pedidoId, estadoPedido: "PAGADO", estadoPago: "PAGADO" };
  }

  async cancelarPedidoTransaccional(
    pedidoId: string,
    motivo: string,
    confirmarReposicionPagado: boolean
  ): Promise<PedidoEstadoTransaccionalResult> {
    const motivoLimpio = motivo?.trim();

    if (!motivoLimpio) {
      throw new PerfumeOrderError("PF004", "Debes indicar un motivo de cancelacion.");
    }

    const order = localStore.orders.find((item) => item.id === pedidoId);

    if (!order) {
      throw new PerfumeOrderError("PF009", "Pedido no encontrado.");
    }

    if (order.estadoPedido === "CANCELADO") {
      throw new PerfumeOrderError("PF011", "Este pedido ya fue cancelado.");
    }

    if (order.estadoPedido === "ENTREGADO") {
      throw new PerfumeOrderError(
        "PF012",
        "Un pedido entregado no se puede cancelar por este flujo."
      );
    }

    const items = localStore.orderItems.filter(
      (item) => item.pedidoId === pedidoId && item.productoId
    );
    let estadoPagoFinal: string;

    if (order.estadoPago === "PAGADO") {
      if (!confirmarReposicionPagado) {
        throw new PerfumeOrderError(
          "PF013",
          "Este pedido ya fue pagado. Confirma explicitamente para cancelarlo."
        );
      }

      if (!order.stockRepuesto) {
        for (const item of items) {
          const product = localStore.products.find((current) => current.id === item.productoId);

          if (product) {
            product.stockActual = (product.stockActual ?? 0) + item.cantidad;
          }
        }
      }

      estadoPagoFinal = order.estadoPago;
    } else {
      if (!order.stockRepuesto) {
        for (const item of items) {
          const product = localStore.products.find((current) => current.id === item.productoId);

          if (product) {
            product.stockReservado = Math.max(0, (product.stockReservado ?? 0) - item.cantidad);
          }
        }
      }

      estadoPagoFinal = "CANCELADO";
    }

    order.estadoPedido = "CANCELADO";
    order.estadoPago = estadoPagoFinal;
    order.fechaCancelacion = new Date().toISOString();
    order.motivoCancelacion = motivoLimpio;
    order.stockRepuesto = true;

    return { pedidoId, estadoPedido: "CANCELADO", estadoPago: estadoPagoFinal };
  }

  async avanzarEstadoPedidoTransaccional(
    pedidoId: string,
    nuevoEstado: "PREPARANDO" | "DESPACHADO" | "ENTREGADO"
  ): Promise<PedidoEstadoTransaccionalResult> {
    const order = localStore.orders.find((item) => item.id === pedidoId);

    if (!order) {
      throw new PerfumeOrderError("PF009", "Pedido no encontrado.");
    }

    const validTransition =
      (order.estadoPedido === "PAGADO" && nuevoEstado === "PREPARANDO") ||
      (order.estadoPedido === "PREPARANDO" && nuevoEstado === "DESPACHADO") ||
      (order.estadoPedido === "DESPACHADO" && nuevoEstado === "ENTREGADO");

    if (!validTransition) {
      throw new PerfumeOrderError(
        "PF012",
        `Transicion invalida desde ${order.estadoPedido} hacia ${nuevoEstado}.`
      );
    }

    const now = new Date().toISOString();
    order.estadoPedido = nuevoEstado;

    if (nuevoEstado === "PREPARANDO") {
      order.fechaPreparacion = now;
    } else if (nuevoEstado === "DESPACHADO") {
      order.fechaDespacho = now;
    } else {
      order.fechaEntrega = now;
    }

    return { pedidoId, estadoPedido: nuevoEstado };
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

  async buscarVentasPorProducto(productId: string): Promise<ProductoVentaRecord[]> {
    const supabase = createSupabaseServerClient();
    const response = await supabase
      .from("pedido_items")
      .select("pedidos!inner(estado_pedido, fecha_pedido, fecha_pago)")
      .eq("producto_id", productId);

    if (response.error) {
      throw new Error(`No fue posible consultar las ventas del producto. ${response.error.message}`);
    }

    return (response.data ?? []).map((row) => {
      const order = Array.isArray(row.pedidos) ? row.pedidos[0] : row.pedidos;
      return {
        estadoPedido: order.estado_pedido,
        fechaPedido: order.fecha_pedido,
        fechaPago: order.fecha_pago ?? undefined
      };
    });
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
        cliente_nombre_snapshot,
        cliente_rut_snapshot,
        cliente_email_snapshot,
        cliente_telefono_snapshot,
        cliente_region_snapshot,
        cliente_comuna_snapshot,
        cliente_direccion_snapshot,
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

      // Snapshot-first (hotfix integridad de identidad): un pedido
      // historico debe conservar siempre la identidad con la que fue
      // creado, aunque la ficha cliente cambie despues (edicion admin, o
      // -- el caso del incidente real -- reutilizacion incorrecta por otro
      // pedido). Fallback a la ficha viva (clientes:cliente_id) SOLO para
      // pedidos legacy creados antes de este hotfix (snapshot null).
      return {
        id: order.id,
        codigo: order.codigo ?? undefined,
        clienteId: order.cliente_id,
        clienteNombre: order.cliente_nombre_snapshot ?? customer?.nombre ?? "Sin nombre",
        clienteTelefono: order.cliente_telefono_snapshot ?? customer?.telefono ?? "",
        clienteLugarTrabajo: customer?.lugar_trabajo ?? "",
        clienteRut: order.cliente_rut_snapshot ?? customer?.rut ?? undefined,
        clienteEmail: order.cliente_email_snapshot ?? customer?.email ?? undefined,
        clienteRegion: order.cliente_region_snapshot ?? customer?.region ?? undefined,
        clienteComuna: order.cliente_comuna_snapshot ?? customer?.comuna ?? undefined,
        clienteDireccion: order.cliente_direccion_snapshot ?? customer?.direccion ?? undefined,
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

  async crearPedidoTransaccional(
    input: CrearPedidoTransaccionalInput
  ): Promise<PedidoTransaccionalResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_perfume_order_v1", {
      p_cliente: {
        nombre: input.cliente.nombre,
        rut: input.cliente.rut ?? null,
        email: input.cliente.email ?? null,
        telefono: input.cliente.telefono ?? null,
        region: input.cliente.region ?? null,
        comuna: input.cliente.comuna ?? null,
        direccion: input.cliente.direccion ?? null,
        referencia_direccion: input.cliente.referenciaDireccion ?? null
      },
      p_items: input.items.map((item) => ({
        producto_id: item.productoId,
        cantidad: item.cantidad
      })),
      p_metodo_despacho: input.metodoDespacho,
      p_observacion: input.observacion ?? null,
      p_origen_pedido: input.origenPedido ?? "PUBLICO"
    });

    if (error) {
      throw mapPerfumeOrderRpcError(error);
    }

    return data as PedidoTransaccionalResult;
  }

  async crearVentaDirectaTransaccional(
    input: CrearVentaDirectaTransaccionalInput
  ): Promise<PedidoTransaccionalResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_direct_sale_v1", {
      p_cliente: {
        nombre: input.cliente.nombre ?? null,
        rut: input.cliente.rut ?? null,
        email: input.cliente.email ?? null,
        telefono: input.cliente.telefono ?? null,
        lugar_trabajo: input.cliente.lugarTrabajo ?? null
      },
      p_items: input.items.map((item) => ({
        producto_id: item.productoId,
        cantidad: item.cantidad
      })),
      p_forma_pago: input.formaPago,
      p_es_fiado: input.esFiado,
      p_observacion: input.observacion ?? null,
      p_idempotency_key: input.idempotencyKey
    });

    if (error) {
      throw mapPerfumeOrderRpcError(error);
    }

    return data as PedidoTransaccionalResult;
  }

  async marcarPedidoPagadoTransaccional(
    pedidoId: string,
    metodoPago = "TRANSFERENCIA"
  ): Promise<PedidoEstadoTransaccionalResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("mark_perfume_order_paid_v1", {
      p_pedido_id: pedidoId,
      p_metodo_pago: metodoPago
    });

    if (error) {
      throw mapPerfumeOrderRpcError(error);
    }

    return data as PedidoEstadoTransaccionalResult;
  }

  async cancelarPedidoTransaccional(
    pedidoId: string,
    motivo: string,
    confirmarReposicionPagado: boolean
  ): Promise<PedidoEstadoTransaccionalResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("cancel_perfume_order_v1", {
      p_pedido_id: pedidoId,
      p_motivo: motivo,
      p_confirmar_reposicion_pagado: confirmarReposicionPagado
    });

    if (error) {
      throw mapPerfumeOrderRpcError(error);
    }

    return data as PedidoEstadoTransaccionalResult;
  }

  async avanzarEstadoPedidoTransaccional(
    pedidoId: string,
    nuevoEstado: "PREPARANDO" | "DESPACHADO" | "ENTREGADO"
  ): Promise<PedidoEstadoTransaccionalResult> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("advance_perfume_order_status_v1", {
      p_pedido_id: pedidoId,
      p_nuevo_estado: nuevoEstado
    });

    if (error) {
      throw mapPerfumeOrderRpcError(error);
    }

    return data as PedidoEstadoTransaccionalResult;
  }
}

export function getPedidoRepository(): PedidoRepository {
  if (isSupabaseConfigured()) {
    return new SupabasePedidoRepository();
  }

  return new MemoryPedidoRepository();
}
