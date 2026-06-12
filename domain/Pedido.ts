/**
 * Proyecto: Pauli Store
 * Modulo: Pedido
 * Descripcion: Entidad de dominio que controla el ciclo de vida de un pedido.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Cliente } from "@/domain/Cliente";
import { DetallePedido } from "@/domain/DetallePedido";
import {
  ESTADO_PAGO_FIADO,
  ESTADO_PAGO_PAGADO,
  ESTADO_PAGO_SIN_PAGO,
  ESTADO_PEDIDO_AGENDADO,
  ESTADO_PEDIDO_CANCELADO,
  ESTADO_PEDIDO_FINALIZADO,
  ESTADO_PEDIDO_PENDIENTE
} from "@/lib/constants";

export type PedidoProps = {
  id?: string;
  cliente: Cliente;
  items: DetallePedido[];
  estadoPedido?: string;
  estadoPago?: string;
  fechaPedido?: Date;
  fechaAgendado?: Date;
  fechaCierre?: Date;
  fechaCancelacion?: Date;
  motivoCancelacion?: string;
};

export class Pedido {
  readonly id?: string;
  readonly cliente: Cliente;
  readonly items: DetallePedido[];
  readonly fechaPedido: Date;
  total: number;
  estadoPedido: string;
  estadoPago: string;
  fechaAgendado?: Date;
  fechaCierre?: Date;
  fechaCancelacion?: Date;
  motivoCancelacion?: string;

  constructor(props: PedidoProps) {
    if (props.items.length === 0) {
      throw new Error("El pedido debe tener al menos un item.");
    }

    this.id = props.id;
    this.cliente = props.cliente;
    this.items = props.items;
    this.fechaPedido = props.fechaPedido ?? new Date();
    this.estadoPedido = props.estadoPedido ?? ESTADO_PEDIDO_PENDIENTE;
    this.estadoPago = props.estadoPago ?? ESTADO_PAGO_SIN_PAGO;
    this.fechaAgendado = props.fechaAgendado;
    this.fechaCierre = props.fechaCierre;
    this.fechaCancelacion = props.fechaCancelacion;
    this.motivoCancelacion = props.motivoCancelacion;
    this.total = this.calcularTotal();
    this.validarEstadoInicial();
  }

  calcularTotal() {
    return this.items.reduce((sum, item) => sum + item.subtotal, 0);
  }

  agendar(fecha = new Date()) {
    this.validarTransicionEstado(ESTADO_PEDIDO_AGENDADO);
    this.estadoPedido = ESTADO_PEDIDO_AGENDADO;
    this.fechaAgendado = fecha;
  }

  cancelar(motivo: string, fecha = new Date()) {
    this.validarTransicionEstado(ESTADO_PEDIDO_CANCELADO);
    this.estadoPedido = ESTADO_PEDIDO_CANCELADO;
    this.fechaCancelacion = fecha;
    this.motivoCancelacion = motivo.trim();
  }

  marcarPagado(fecha = new Date()) {
    if (this.estadoPedido !== ESTADO_PEDIDO_AGENDADO) {
      throw new Error("Solo se puede marcar pagado un pedido agendado.");
    }

    this.estadoPago = ESTADO_PAGO_PAGADO;
    this.finalizar(fecha);
  }

  marcarFiado(fecha = new Date()) {
    if (this.estadoPedido !== ESTADO_PEDIDO_AGENDADO) {
      throw new Error("Solo se puede marcar fiado un pedido agendado.");
    }

    this.estadoPago = ESTADO_PAGO_FIADO;
    this.finalizar(fecha);
  }

  finalizar(fecha = new Date()) {
    this.estadoPedido = ESTADO_PEDIDO_FINALIZADO;
    this.fechaCierre = fecha;
  }

  validarTransicionEstado(nuevoEstado: string) {
    if (this.estadoPedido === ESTADO_PEDIDO_PENDIENTE) {
      if (
        nuevoEstado === ESTADO_PEDIDO_AGENDADO ||
        nuevoEstado === ESTADO_PEDIDO_CANCELADO
      ) {
        return;
      }
    }

    if (this.estadoPedido === ESTADO_PEDIDO_AGENDADO) {
      if (
        nuevoEstado === ESTADO_PEDIDO_FINALIZADO ||
        nuevoEstado === ESTADO_PEDIDO_CANCELADO
      ) {
        return;
      }
    }

    throw new Error(
      `Transicion invalida desde ${this.estadoPedido} hacia ${nuevoEstado}.`
    );
  }

  estaExpirado(horasExpiracion: number, ahora = new Date()) {
    if (this.estadoPedido !== ESTADO_PEDIDO_PENDIENTE) {
      return false;
    }

    const milisegundosExpiracion = horasExpiracion * 60 * 60 * 1000;
    return ahora.getTime() - this.fechaPedido.getTime() >= milisegundosExpiracion;
  }

  private validarEstadoInicial() {
    if (this.estadoPedido === ESTADO_PEDIDO_PENDIENTE) {
      if (this.estadoPago !== ESTADO_PAGO_SIN_PAGO) {
        throw new Error("Un pedido pendiente debe iniciar sin pago.");
      }
      return;
    }

    if (this.estadoPedido === ESTADO_PEDIDO_AGENDADO) {
      if (this.estadoPago !== ESTADO_PAGO_SIN_PAGO) {
        throw new Error("Un pedido agendado debe seguir sin pago.");
      }
      return;
    }

    if (this.estadoPedido === ESTADO_PEDIDO_FINALIZADO) {
      if (
        this.estadoPago !== ESTADO_PAGO_PAGADO &&
        this.estadoPago !== ESTADO_PAGO_FIADO
      ) {
        throw new Error("Un pedido finalizado debe estar pagado o fiado.");
      }
      return;
    }

    if (this.estadoPedido === ESTADO_PEDIDO_CANCELADO) {
      return;
    }

    throw new Error("Estado de pedido invalido.");
  }
}
