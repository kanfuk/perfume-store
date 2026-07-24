/**
 * Proyecto: Perfume Store
 * Modulo: Pedido
 * Descripcion: Entidad de dominio que controla el ciclo de vida de un pedido.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 *
 * Ciclo de vida (ver docs/PERFUME_STORE_APPLICATION_CONTRACT.md):
 * NUEVO -> AGENDADO -> PAGADO -> PREPARANDO -> DESPACHADO -> ENTREGADO
 * CANCELADO es alcanzable desde cualquier estado previo a ENTREGADO.
 * Este flujo reemplaza por completo el de Pauli Store (PENDIENTE/FINALIZADO/FIADO
 * ya no existen como valores validos de estadoPedido/estadoPago).
 */

import { Cliente } from "@/domain/Cliente";
import { DetallePedido } from "@/domain/DetallePedido";
import {
  calcularCostoDespacho,
  ESTADO_PAGO_CANCELADO,
  ESTADO_PAGO_PAGADO,
  ESTADO_PAGO_SIN_PAGO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_DESPACHADO,
  ESTADO_PEDIDO_ENTREGADO,
  ESTADO_PEDIDO_NUEVO,
  ESTADO_PEDIDO_PAGADO,
  ESTADO_PEDIDO_PREPARANDO,
  ESTADO_PEDIDO_TRANSICIONES,
  type EstadoPago,
  type EstadoPedido,
  type MetodoDespacho
} from "@/lib/constants";

export type PedidoProps = {
  id?: string;
  codigo?: string;
  cliente: Cliente;
  items: DetallePedido[];
  metodoDespacho: MetodoDespacho;
  costoDespacho?: number;
  estadoPedido?: EstadoPedido;
  estadoPago?: EstadoPago;
  observacion?: string;
  motivoCancelacion?: string;
  stockRepuesto?: boolean;
  fechaPedido?: Date;
  fechaAgendado?: Date;
  fechaPago?: Date;
  fechaPreparacion?: Date;
  fechaDespacho?: Date;
  fechaEntrega?: Date;
  fechaCancelacion?: Date;
};

export class Pedido {
  readonly id?: string;
  readonly codigo?: string;
  readonly cliente: Cliente;
  readonly items: DetallePedido[];
  readonly metodoDespacho: MetodoDespacho;
  readonly fechaPedido: Date;
  subtotal: number;
  costoDespacho: number;
  total: number;
  estadoPedido: EstadoPedido;
  estadoPago: EstadoPago;
  stockRepuesto: boolean;
  fechaAgendado?: Date;
  fechaPago?: Date;
  fechaPreparacion?: Date;
  fechaDespacho?: Date;
  fechaEntrega?: Date;
  fechaCancelacion?: Date;
  observacion?: string;
  motivoCancelacion?: string;

  constructor(props: PedidoProps) {
    if (props.items.length === 0) {
      throw new Error("El pedido debe tener al menos un item.");
    }

    this.id = props.id;
    this.codigo = props.codigo;
    this.cliente = props.cliente;
    this.items = props.items;
    this.metodoDespacho = props.metodoDespacho;
    this.fechaPedido = props.fechaPedido ?? new Date();
    this.observacion = props.observacion;
    this.motivoCancelacion = props.motivoCancelacion;
    this.stockRepuesto = props.stockRepuesto ?? false;
    this.fechaAgendado = props.fechaAgendado;
    this.fechaPago = props.fechaPago;
    this.fechaPreparacion = props.fechaPreparacion;
    this.fechaDespacho = props.fechaDespacho;
    this.fechaEntrega = props.fechaEntrega;
    this.fechaCancelacion = props.fechaCancelacion;
    this.estadoPedido = props.estadoPedido ?? ESTADO_PEDIDO_NUEVO;
    this.estadoPago = props.estadoPago ?? ESTADO_PAGO_SIN_PAGO;
    this.subtotal = this.calcularSubtotal();
    this.costoDespacho =
      props.costoDespacho ?? calcularCostoDespacho(this.metodoDespacho);
    this.total = this.subtotal + this.costoDespacho;
    this.validarEstadoInicial();
  }

  calcularSubtotal() {
    return this.items.reduce((sum, item) => sum + item.subtotal, 0);
  }

  recalcularTotales() {
    this.subtotal = this.calcularSubtotal();
    this.total = this.subtotal + this.costoDespacho;
    return this.total;
  }

  validarTransicionEstado(nuevoEstado: EstadoPedido) {
    const permitidos = ESTADO_PEDIDO_TRANSICIONES[this.estadoPedido];

    if (!permitidos.includes(nuevoEstado)) {
      throw new Error(
        `Transicion invalida desde ${this.estadoPedido} hacia ${nuevoEstado}.`
      );
    }
  }

  agendar(fecha = new Date()) {
    this.validarTransicionEstado(ESTADO_PEDIDO_AGENDADO);
    this.estadoPedido = ESTADO_PEDIDO_AGENDADO;
    this.fechaAgendado = fecha;
  }

  marcarPagado(fecha = new Date()) {
    this.validarTransicionEstado(ESTADO_PEDIDO_PAGADO);
    this.estadoPedido = ESTADO_PEDIDO_PAGADO;
    this.estadoPago = ESTADO_PAGO_PAGADO;
    this.fechaPago = fecha;
  }

  iniciarPreparacion(fecha = new Date()) {
    this.validarTransicionEstado(ESTADO_PEDIDO_PREPARANDO);
    this.estadoPedido = ESTADO_PEDIDO_PREPARANDO;
    this.fechaPreparacion = fecha;
  }

  despachar(fecha = new Date()) {
    this.validarTransicionEstado(ESTADO_PEDIDO_DESPACHADO);
    this.estadoPedido = ESTADO_PEDIDO_DESPACHADO;
    this.fechaDespacho = fecha;
  }

  entregar(fecha = new Date()) {
    this.validarTransicionEstado(ESTADO_PEDIDO_ENTREGADO);
    this.estadoPedido = ESTADO_PEDIDO_ENTREGADO;
    this.fechaEntrega = fecha;
  }

  /**
   * Cancela el pedido. Si el pedido ya estaba pagado, el llamador debe pasar
   * `confirmarPagoPerdido: true` explicitamente: un pedido pagado nunca se
   * cancela en silencio sin que quien opera lo confirme a proposito.
   */
  cancelar(
    motivo: string,
    options: { fecha?: Date; confirmarPagoPerdido?: boolean } = {}
  ) {
    this.validarTransicionEstado(ESTADO_PEDIDO_CANCELADO);

    if (this.estadoPago === ESTADO_PAGO_PAGADO && !options.confirmarPagoPerdido) {
      throw new Error(
        "Este pedido ya fue pagado. Confirma explicitamente para cancelarlo."
      );
    }

    if (!motivo.trim()) {
      throw new Error("Debes indicar un motivo de cancelacion.");
    }

    this.estadoPedido = ESTADO_PEDIDO_CANCELADO;
    this.fechaCancelacion = options.fecha ?? new Date();
    this.motivoCancelacion = motivo.trim();

    if (this.estadoPago === ESTADO_PAGO_SIN_PAGO) {
      this.estadoPago = ESTADO_PAGO_CANCELADO;
    }
  }

  estaExpirado(horasExpiracion: number, ahora = new Date()) {
    if (this.estadoPedido !== ESTADO_PEDIDO_NUEVO) {
      return false;
    }

    const milisegundosExpiracion = horasExpiracion * 60 * 60 * 1000;
    return ahora.getTime() - this.fechaPedido.getTime() >= milisegundosExpiracion;
  }

  /**
   * Solo exige "sin pago" en NUEVO/AGENDADO (flujo publico, pago por
   * transferencia verificada despues de agendar). No exige lo contrario para
   * estados posteriores: la venta directa en persona puede construir un
   * pedido ya ENTREGADO con estadoPago SIN_PAGO cuando queda fiado (el saldo
   * se rastrea aparte, en la tabla fiados), y eso es un caso valido.
   */
  private validarEstadoInicial() {
    if (
      (this.estadoPedido === ESTADO_PEDIDO_NUEVO ||
        this.estadoPedido === ESTADO_PEDIDO_AGENDADO) &&
      this.estadoPago !== ESTADO_PAGO_SIN_PAGO
    ) {
      throw new Error("Un pedido nuevo o agendado debe iniciar sin pago.");
    }
  }
}
