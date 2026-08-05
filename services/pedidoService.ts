/**
 * Proyecto: Perfume Store
 * Modulo: Gestion de Pedidos
 * Descripcion: Servicio encargado de aplicar reglas de negocio sobre pedidos.
 * Buenas practicas: Separacion de responsabilidades y validacion de estados.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 *
 * IMPORTANTE (stock): la creacion de pedidos publicos (crearPedido) y las
 * transiciones de pago/cancelacion/avance de estado usan las RPC
 * transaccionales de Postgres (create_perfume_order_v1,
 * mark_perfume_order_paid_v1, cancel_perfume_order_v1,
 * advance_perfume_order_status_v1 - ver
 * supabase/migrations/20260724010000_perfume_store_transactional_stock.sql).
 * La reserva/liberacion/descuento real de stock ocurre atomicamente dentro
 * de esas funciones; este servicio ya no hace escrituras de stock propias
 * para ese flujo. crearVentaDirecta y crearPedidoPersonalizado siguen
 * usando el mecanismo heredado (fuera del alcance de esta fase); si un
 * pedido creado por esos flujos llega a marcarPedidoPagado, la RPC lo
 * rechaza con PF015 en lugar de corromper el stock, ver
 * docs/PERFUME_STORE_TRANSACTIONAL_STOCK.md.
 */

import { Cliente } from "@/domain/Cliente";
import { DetallePedido } from "@/domain/DetallePedido";
import { Pedido } from "@/domain/Pedido";
import { Producto } from "@/domain/Producto";
import {
  ESTADO_PAGO_PAGADO,
  ESTADO_PAGO_SIN_PAGO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_DESPACHADO,
  ESTADO_PEDIDO_ENTREGADO,
  ESTADO_PEDIDO_NUEVO,
  ESTADO_PEDIDO_PAGADO,
  ESTADO_PEDIDO_PREPARANDO,
  METODO_DESPACHO_STARKEN_POR_PAGAR,
  ORIGEN_PEDIDO_PERSONALIZADO,
  ORIGEN_PEDIDO_PUBLICO,
  isMetodoDespacho,
  type MetodoDespacho
} from "@/lib/constants";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import { CustomerBlockedError } from "@/lib/customers/customerBlockedError";
import { PerfumeOrderError } from "@/lib/perfumeOrderErrors";
import { parseChileanRut } from "@/lib/rut";
import type {
  AdminDirectSaleRequest,
  AdminDashboardData,
  AdminOrderSummary,
  CustomOrderRequest,
  CustomerOrderRequest,
  CustomerOrderResponse
} from "@/lib/types";
import {
  isValidEmail,
  validateAdminDirectSaleForm,
  validateCustomOrderForm,
  validateCustomerOrderForm
} from "@/lib/validators";
import { getNewAdminOrdersCount } from "@/lib/admin/getPendingAdminOrders";
import { getAvailableProductStock, shouldDecreaseStock } from "@/lib/stock";
import { sendPendingOrdersPushToAdmins } from "@/lib/pwa/sendWebPush";
import type { ClienteRepository } from "@/repositories/clienteRepository";
import { getClienteRepository } from "@/repositories/clienteRepository";
import type { PedidoRepository } from "@/repositories/pedidoRepository";
import type { PedidoListItemRecord } from "@/repositories/pedidoRepository";
import { getPedidoRepository } from "@/repositories/pedidoRepository";
import type { ProductRepository } from "@/repositories/productRepository";
import { getProductRepository } from "@/repositories/productRepository";

/**
 * Metodo de despacho de respaldo para flujos administrativos que todavia no
 * capturan un metodo de despacho real (venta directa en persona, pedido
 * personalizado). No implica envio: costo 0. Ver
 * docs/PERFUME_STORE_APPLICATION_CONTRACT.md, seccion de limitaciones.
 */
const METODO_DESPACHO_SIN_ENVIO: MetodoDespacho = METODO_DESPACHO_STARKEN_POR_PAGAR;

export class PedidoService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly clienteRepository: ClienteRepository,
    private readonly pedidoRepository: PedidoRepository
  ) {}

  async crearPedido(input: CustomerOrderRequest): Promise<CustomerOrderResponse> {
    // Pre-validacion de formato/UX: la autoridad final sobre disponibilidad
    // de stock y precios es la RPC create_perfume_order_v1, no este bloque.
    const products = await this.productRepository.buscarProductosActivos();
    const validation = validateCustomerOrderForm(
      {
        nombre: input.nombre,
        rut: input.rut,
        email: input.email,
        telefono: input.telefono,
        region: input.region,
        comuna: input.comuna,
        direccion: input.direccion,
        referenciaDireccion: input.referenciaDireccion,
        metodoDespacho: input.metodoDespacho,
        items: input.items
      },
      products
    );

    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors)[0] ?? "Formulario invalido.");
    }

    const normalizedPhone = parseChileanMobilePhone(input.telefono);

    if (!normalizedPhone) {
      throw new Error("Ingresa un celular chileno valido. Ejemplo: +56 9 1234 5678.");
    }

    const normalizedRut = parseChileanRut(input.rut);

    if (!normalizedRut) {
      throw new Error("Ingresa un RUT chileno valido. Ejemplo: 12.345.678-5.");
    }

    if (!isValidEmail(input.email)) {
      throw new Error("Ingresa un correo electronico valido.");
    }

    if (!isMetodoDespacho(input.metodoDespacho)) {
      throw new Error("Selecciona un metodo de despacho valido.");
    }

    const normalizedEmail = input.email.trim().toLowerCase();

    // Banlist (Fase 7.5A): comprobacion server-side ANTES de cualquier
    // escritura. No existe ninguna escritura previa a la RPC en este flujo
    // (ver crearPedidoTransaccional mas abajo), asi que esta lectura es
    // segura de hacer primero: si hay coincidencia, no se llama a la RPC,
    // no se crea pedido, no se reserva stock, no se crea/edita cliente.
    // Coincidencia exacta por telefono, luego RUT, luego correo -- nunca
    // fuzzy. La RPC create_perfume_order_v1 NO se modifico: existe una
    // ventana de carrera residual documentada en
    // docs/SMELLME_CUSTOMER_BANLIST_DESIGN.md (aceptada para esta fase).
    const bloqueado = await this.clienteRepository.buscarClienteBloqueadoPorIdentidad({
      telefono: normalizedPhone.e164,
      rut: normalizedRut.normalized,
      email: normalizedEmail
    });

    if (bloqueado) {
      throw new CustomerBlockedError();
    }

    // Un unico llamado atomico: crea cliente, pedido, items y reserva stock
    // (create_perfume_order_v1). Nunca se envian precio/subtotal/total ni
    // estado calculados en el navegador: la RPC los recalcula desde
    // productos y rechaza cantidades que superen el stock disponible.
    const resultado = await this.pedidoRepository.crearPedidoTransaccional({
      cliente: {
        nombre: input.nombre.trim(),
        rut: normalizedRut.normalized,
        email: normalizedEmail,
        telefono: normalizedPhone.e164,
        region: input.region.trim(),
        comuna: input.comuna.trim(),
        direccion: input.direccion.trim(),
        referenciaDireccion: input.referenciaDireccion?.trim() || undefined
      },
      items: input.items.map((line) => ({
        productoId: line.productoId,
        cantidad: line.cantidad
      })),
      metodoDespacho: input.metodoDespacho,
      observacion: input.observacion?.trim() || undefined,
      origenPedido: ORIGEN_PEDIDO_PUBLICO
    });

    await this.notifyPendingOrdersBadgeChange(resultado.pedidoId);

    return {
      pedidoId: resultado.pedidoId,
      codigo: resultado.codigo,
      clienteId: resultado.clienteId,
      subtotal: resultado.subtotal,
      costoDespacho: resultado.costoDespacho,
      total: resultado.total,
      estadoPedido: resultado.estadoPedido,
      estadoPago: resultado.estadoPago,
      metodoDespacho: resultado.metodoDespacho as MetodoDespacho,
      origenPedido: resultado.origenPedido as CustomerOrderResponse["origenPedido"],
      items: resultado.items.map((item) => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        costoUnitario: item.costoUnitario,
        costoTotal: item.costoTotal,
        utilidadBruta: item.utilidadBruta,
        subtotal: item.subtotal
      }))
    };
  }

  async crearVentaDirecta(input: AdminDirectSaleRequest): Promise<CustomerOrderResponse> {
    // Pre-validacion de formato/UX: la autoridad final sobre producto
    // activo, stock disponible y forma de pago es la RPC
    // create_direct_sale_v1 (via crearVentaDirectaTransaccional), no este
    // bloque.
    const products = await this.productRepository.buscarTodosProductos();
    const validation = validateAdminDirectSaleForm(input, products);

    if (!validation.isValid) {
      throw new Error(Object.values(validation.errors)[0] ?? "Formulario invalido.");
    }

    const telefono = input.telefono?.trim()
      ? parseChileanMobilePhone(input.telefono)?.e164 ?? ""
      : "";

    // Un unico llamado atomico: crea/reutiliza cliente, pedido e items,
    // descuenta stock y registra pago o fiado (create_direct_sale_v1).
    // Nunca se envian precio/subtotal/total calculados en el navegador: la
    // RPC los recalcula desde productos y rechaza productos inactivos o
    // cantidades que superen el stock disponible. idempotencyKey evita
    // registrar la misma venta dos veces ante doble clic o reintento de red.
    const resultado = await this.pedidoRepository.crearVentaDirectaTransaccional({
      cliente: {
        nombre: input.nombre?.trim() || undefined,
        telefono: telefono || undefined,
        lugarTrabajo: input.lugarTrabajo?.trim() || undefined
      },
      items: input.items.map((line) => ({
        productoId: line.productoId,
        cantidad: line.cantidad
      })),
      formaPago: input.formaPago,
      esFiado: input.estadoPago === "FIADO",
      observacion: input.observacion?.trim() || undefined,
      idempotencyKey: input.idempotencyKey
    });

    return {
      pedidoId: resultado.pedidoId,
      codigo: resultado.codigo,
      clienteId: resultado.clienteId,
      subtotal: resultado.subtotal,
      costoDespacho: resultado.costoDespacho,
      total: resultado.total,
      estadoPedido: resultado.estadoPedido,
      estadoPago: resultado.estadoPago,
      metodoDespacho: resultado.metodoDespacho as MetodoDespacho,
      origenPedido: resultado.origenPedido as CustomerOrderResponse["origenPedido"],
      items: resultado.items.map((item) => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        costoUnitario: item.costoUnitario,
        costoTotal: item.costoTotal,
        utilidadBruta: item.utilidadBruta,
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
      imageUrl: linkedProduct?.imageUrl || "",
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

    const now = new Date();
    // Pedido personalizado: fuera del flujo principal de perfumes. Se agenda
    // manualmente segun estadoInicial; sin despacho real capturado todavia
    // (ver METODO_DESPACHO_SIN_ENVIO).
    const pedido = new Pedido({
      cliente,
      items: [item],
      metodoDespacho: METODO_DESPACHO_SIN_ENVIO,
      costoDespacho: 0,
      estadoPedido: input.estadoInicial,
      estadoPago: input.estadoInicial === "PAGADO" ? ESTADO_PAGO_PAGADO : ESTADO_PAGO_SIN_PAGO,
      fechaAgendado: input.estadoInicial === ESTADO_PEDIDO_AGENDADO ? now : undefined,
      fechaPago: input.estadoInicial === "PAGADO" ? now : undefined
    });

    const { id: clienteId } = await this.clienteRepository.upsertCliente(
      cliente,
      input.clienteId
    );
    const observationParts = [
      input.descripcion?.trim(),
      input.costoEstimadoTotal !== undefined
        ? `Costo estimado total: ${input.costoEstimadoTotal}`
        : undefined
    ].filter(Boolean);
    const { id: pedidoId, codigo } = await this.pedidoRepository.insertarPedido({
      pedido,
      clienteId,
      origenPedido: ORIGEN_PEDIDO_PERSONALIZADO,
      observacion: observationParts.join(" | ") || undefined
    });

    await this.pedidoRepository.insertarPedidoItem({
      pedidoId,
      item,
      productoId: linkedProduct?.id ?? null
    });

    if (linkedProduct && shouldDecreaseStock(linkedProduct)) {
      await this.productRepository.ajustarStockAgenda(linkedProduct.id, -item.cantidad);
    }

    if (input.estadoInicial === "PAGADO") {
      await this.pedidoRepository.insertarPago({
        pedidoId,
        monto: pedido.total,
        metodoPago: "EFECTIVO",
        estadoPago: ESTADO_PAGO_PAGADO,
        fechaPago: now.toISOString()
      });
    }

    if (pedido.estadoPedido === ESTADO_PEDIDO_NUEVO) {
      await this.notifyPendingOrdersBadgeChange(pedidoId);
    }

    return this.buildCustomerOrderResponse(
      pedido,
      pedidoId,
      codigo,
      clienteId,
      [item],
      ORIGEN_PEDIDO_PERSONALIZADO
    );
  }

  async obtenerPedidosPorEstado(estadoPedido: string): Promise<AdminOrderSummary[]> {
    const orders = await this.pedidoRepository.buscarPedidosPorEstado(estadoPedido);
    return this.enriquecerPedidosAdmin(orders);
  }

  /**
   * Busca un pedido por id sin asumir su estado (a diferencia de
   * obtenerPedidoUnico, que exige el estado esperado). Usado por acciones
   * de solo lectura ("reenviar-transferencia", "coordinar-entrega") que
   * necesitan el snapshot actual del pedido para reconstruir un mensaje de
   * WhatsApp sin mutar nada.
   */
  async obtenerPedidoAdminPorId(pedidoId: string): Promise<AdminOrderSummary> {
    const resultadosPorEstado = await Promise.all(
      [
        ESTADO_PEDIDO_NUEVO,
        ESTADO_PEDIDO_AGENDADO,
        ESTADO_PEDIDO_PAGADO,
        ESTADO_PEDIDO_PREPARANDO,
        ESTADO_PEDIDO_DESPACHADO,
        ESTADO_PEDIDO_ENTREGADO,
        ESTADO_PEDIDO_CANCELADO
      ].map((estado) => this.obtenerPedidosPorEstado(estado))
    );

    const pedido = resultadosPorEstado.flat().find((order) => order.id === pedidoId);

    if (!pedido) {
      throw new Error("Pedido no encontrado.");
    }

    return pedido;
  }

  async obtenerDashboardAdmin(): Promise<AdminDashboardData> {
    const [nuevos, agendados, pagados, preparando, despachados, entregados, cancelados] =
      await Promise.all([
        this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_NUEVO),
        this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_AGENDADO),
        this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_PAGADO),
        this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_PREPARANDO),
        this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_DESPACHADO),
        this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_ENTREGADO),
        this.pedidoRepository.buscarPedidosPorEstado(ESTADO_PEDIDO_CANCELADO)
      ]);
    // "finalizados" agrupa todo lo que ya fue pagado (PAGADO/PREPARANDO/
    // DESPACHADO/ENTREGADO): se muestran juntos en el historial admin
    // (lectura, sin botones de accion todavia para preparar/despachar/
    // entregar - ver docs/PERFUME_STORE_APPLICATION_CONTRACT.md).
    const finalizadosRaw = [...pagados, ...preparando, ...despachados, ...entregados];
    const enriched = await this.enriquecerPedidosAdmin([
      ...nuevos,
      ...agendados,
      ...finalizadosRaw,
      ...cancelados
    ]);

    const byId = new Map(enriched.map((order) => [order.id, order]));
    const finalizadosEnriched = finalizadosRaw
      .map((order) => byId.get(order.id))
      .filter((order): order is AdminOrderSummary => Boolean(order))
      .sort((a, b) =>
        (b.fechaEntrega ?? b.fechaPago ?? b.fechaPedido).localeCompare(
          a.fechaEntrega ?? a.fechaPago ?? a.fechaPedido
        )
      );

    const pendientesEnriched = nuevos
      .map((order) => byId.get(order.id))
      .filter((order): order is AdminOrderSummary => Boolean(order));
    const agendadosEnriched = agendados
      .map((order) => byId.get(order.id))
      .filter((order): order is AdminOrderSummary => Boolean(order));
    const fiadosPendientes = finalizadosEnriched.filter(
      (order) => order.estadoPago === ESTADO_PAGO_SIN_PAGO && order.saldoPendiente > 0
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

  async agendarPedido(pedidoId: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_NUEVO);
    const domainPedido = this.mapListItemToPedido(pedido);

    await this.validarStockVigente(pedido);
    domainPedido.agendar();

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: domainPedido.estadoPedido,
      estadoPago: domainPedido.estadoPago,
      adminSeen: true,
      adminSeenAt: new Date().toISOString(),
      fechaAgendado: domainPedido.fechaAgendado?.toISOString()
    });
  }

  /**
   * Marca un pedido como pagado usando mark_perfume_order_paid_v1: la RPC
   * valida el estado, convierte la reserva de stock en descuento fisico
   * (stock_actual y stock_reservado) y registra el pago, todo en una sola
   * transaccion. Este metodo ya no hace escrituras de stock ni de pagos por
   * su cuenta.
   *
   * Idempotente a proposito: la RPC en si NO lo es. Un segundo llamado sobre
   * un pedido ya PAGADO responde PF012 ("no admite marcar pagado en su
   * estado actual" - ese chequeo de estado_pedido corre antes que el de
   * estado_pago, asi que PF010 en la practica no se alcanza en este caso
   * puntual). Por eso, ante PF010 o PF012 se verifica si el pedido ya esta
   * PAGADO: si lo esta, es un doble clic del admin y se retorna con exito
   * sin repetir ningun efecto (ni venta duplicada ni descuento de stock
   * adicional). Si no lo esta (p.ej. intento de pagar un pedido CANCELADO o
   * ENTREGADO), el error se propaga tal cual: eso si es una transicion
   * invalida real. Ver docs/SMELLME_ORDER_OPERATIONS_FLOW.md.
   */
  async marcarPedidoPagado(pedidoId: string, metodoPago = "TRANSFERENCIA") {
    let resultado;

    try {
      resultado = await this.pedidoRepository.marcarPedidoPagadoTransaccional(
        pedidoId,
        metodoPago
      );
    } catch (error) {
      if (error instanceof PerfumeOrderError && (error.code === "PF010" || error.code === "PF012")) {
        const pedidosPagados = await this.pedidoRepository.buscarPedidosPorEstado(
          ESTADO_PEDIDO_PAGADO
        );
        const yaPagado = pedidosPagados.some((pedido) => pedido.id === pedidoId);

        if (yaPagado) {
          return;
        }
      }

      throw error;
    }

    // Segunda escritura, solo de metadata admin (admin_seen); el estado y
    // el pago ya quedaron fijados atomicamente por la RPC, aqui unicamente
    // se reflejan los valores que ella devolvio.
    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: resultado.estadoPedido,
      estadoPago: resultado.estadoPago,
      adminSeen: true,
      adminSeenAt: new Date().toISOString()
    });
  }

  /** Transicion de estado (sin efecto en stock) via advance_perfume_order_status_v1. */
  async iniciarPreparacionPedido(pedidoId: string) {
    await this.pedidoRepository.avanzarEstadoPedidoTransaccional(pedidoId, "PREPARANDO");
  }

  /** Transicion de estado (sin efecto en stock) via advance_perfume_order_status_v1. */
  async despacharPedido(pedidoId: string) {
    await this.pedidoRepository.avanzarEstadoPedidoTransaccional(pedidoId, "DESPACHADO");
  }

  /** Transicion de estado (sin efecto en stock) via advance_perfume_order_status_v1. */
  async entregarPedido(pedidoId: string) {
    await this.pedidoRepository.avanzarEstadoPedidoTransaccional(pedidoId, "ENTREGADO");
  }

  /**
   * Cancela un pedido usando cancel_perfume_order_v1. `confirmarPagoPerdido`
   * NO tiene valor por defecto implicito: solo cuando el llamador lo pasa
   * explicitamente en `true` la RPC repone stock_actual de un pedido ya
   * pagado; cualquier otro valor (undefined, false) se envia como `false` y
   * la RPC rechaza la cancelacion de un pedido pagado sin confirmacion
   * (PF013).
   *
   * Idempotente a proposito: si el pedido ya estaba CANCELADO, la RPC
   * responde PF011; aca se atrapa ese caso puntual y se retorna con exito
   * sin liberar la reserva ni reponer stock una segunda vez. Ver
   * docs/SMELLME_ORDER_OPERATIONS_FLOW.md.
   */
  async cancelarPedido(
    pedidoId: string,
    motivoCancelacion: string,
    options: { confirmarPagoPerdido?: boolean } = {}
  ) {
    try {
      await this.pedidoRepository.cancelarPedidoTransaccional(
        pedidoId,
        motivoCancelacion,
        options.confirmarPagoPerdido === true
      );
    } catch (error) {
      if (error instanceof PerfumeOrderError && error.code === "PF011") {
        return;
      }

      throw error;
    }
  }

  async registrarAbonoFiado(
    pedidoId: string,
    monto: number,
    metodoPago = "EFECTIVO"
  ) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_ENTREGADO);

    if (pedido.estadoPago === ESTADO_PAGO_PAGADO) {
      throw new Error("Este pedido ya esta pagado.");
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
      estadoPago: saldoPendiente === 0 ? ESTADO_PAGO_PAGADO : ESTADO_PAGO_SIN_PAGO,
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
        estadoPedido: ESTADO_PEDIDO_ENTREGADO,
        estadoPago: ESTADO_PAGO_PAGADO,
        adminSeen: true,
        adminSeenAt: new Date().toISOString(),
        fechaPago
      });
    }
  }

  async marcarPedidoVisto(pedidoId: string) {
    const pedido = await this.obtenerPedidoUnico(pedidoId, ESTADO_PEDIDO_NUEVO);

    await this.pedidoRepository.actualizarEstadoPedido({
      pedidoId,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      adminSeen: true,
      adminSeenAt: new Date().toISOString(),
      fechaAgendado: pedido.fechaAgendado,
      fechaCancelacion: pedido.fechaCancelacion,
      motivoCancelacion: pedido.motivoCancelacion
    });
  }

  private buildCustomerOrderResponse(
    pedido: Pedido,
    pedidoId: string,
    codigo: string | undefined,
    clienteId: string,
    items: DetallePedido[],
    origenPedido: string
  ): CustomerOrderResponse {
    return {
      pedidoId,
      codigo: codigo ?? pedido.codigo,
      clienteId,
      subtotal: pedido.subtotal,
      costoDespacho: pedido.costoDespacho,
      total: pedido.total,
      estadoPedido: pedido.estadoPedido,
      estadoPago: pedido.estadoPago,
      metodoDespacho: pedido.metodoDespacho,
      origenPedido: origenPedido as CustomerOrderResponse["origenPedido"],
      items: items.map((item) => ({
        productoId: item.producto.id || null,
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
              id: currentItem.productoId ?? "producto-eliminado",
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

    const metodoDespacho = isMetodoDespacho(order.metodoDespacho ?? "")
      ? (order.metodoDespacho as MetodoDespacho)
      : METODO_DESPACHO_SIN_ENVIO;

    return new Pedido({
      id: order.id,
      codigo: order.codigo,
      cliente,
      items,
      metodoDespacho,
      costoDespacho: order.costoDespacho,
      estadoPedido: order.estadoPedido as Pedido["estadoPedido"],
      estadoPago: order.estadoPago as Pedido["estadoPago"],
      fechaPedido: new Date(order.fechaPedido),
      fechaAgendado: order.fechaAgendado ? new Date(order.fechaAgendado) : undefined,
      fechaPago: order.fechaPago ? new Date(order.fechaPago) : undefined,
      fechaPreparacion: order.fechaPreparacion ? new Date(order.fechaPreparacion) : undefined,
      fechaDespacho: order.fechaDespacho ? new Date(order.fechaDespacho) : undefined,
      fechaEntrega: order.fechaEntrega ? new Date(order.fechaEntrega) : undefined,
      fechaCancelacion: order.fechaCancelacion ? new Date(order.fechaCancelacion) : undefined,
      motivoCancelacion: order.motivoCancelacion,
      stockRepuesto: order.stockRepuesto
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
        clienteRut: (order as PedidoListItemRecord).clienteRut,
        clienteEmail: (order as PedidoListItemRecord).clienteEmail,
        clienteRegion: (order as PedidoListItemRecord).clienteRegion,
        clienteComuna: (order as PedidoListItemRecord).clienteComuna,
        clienteDireccion: (order as PedidoListItemRecord).clienteDireccion,
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
        saldoPendiente:
          currentFiado?.montoPendiente ??
          (order.estadoPago === ESTADO_PAGO_SIN_PAGO ? order.total - totalPagado : 0),
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

  private async validarStockVigente(pedido: PedidoListItemRecord) {
    const productos = await this.productRepository.buscarTodosProductos();

    for (const item of pedido.items) {
      if (!item.productoId) {
        continue;
      }

      const producto = productos.find((product) => product.id === item.productoId);

      if (!producto) {
        continue;
      }

      const domainProduct = new Producto(producto);
      // El stock ya fue descontado al crear el pedido: se suma de vuelta la
      // cantidad de este item para saber cuanto habria disponible sin el.
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

  private async notifyPendingOrdersBadgeChange(pedidoId?: string) {
    try {
      const pendingOrders = await this.pedidoRepository.buscarPedidosPorEstado(
        ESTADO_PEDIDO_NUEVO
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

export function createPedidoService() {
  return new PedidoService(
    getProductRepository(),
    getClienteRepository(),
    getPedidoRepository()
  );
}
