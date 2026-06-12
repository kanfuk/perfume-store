/**
 * Proyecto: Pauli Store
 * Modulo: CuentaFiado
 * Descripcion: Entidad de dominio que controla una deuda asociada a un pedido fiado.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Cliente } from "@/domain/Cliente";
import { Pedido } from "@/domain/Pedido";

export type CuentaFiadoProps = {
  cliente: Cliente;
  pedido: Pedido;
  montoPendiente?: number;
  estado?: "PENDIENTE" | "PAGADO";
  fechaFiado?: Date;
  fechaPagoFiado?: Date;
};

export class CuentaFiado {
  readonly cliente: Cliente;
  readonly pedido: Pedido;
  readonly fechaFiado: Date;
  montoPendiente: number;
  estado: "PENDIENTE" | "PAGADO";
  fechaPagoFiado?: Date;

  constructor(props: CuentaFiadoProps) {
    this.cliente = props.cliente;
    this.pedido = props.pedido;
    this.fechaFiado = props.fechaFiado ?? new Date();
    this.montoPendiente = props.montoPendiente ?? props.pedido.total;
    this.estado = props.estado ?? "PENDIENTE";
    this.fechaPagoFiado = props.fechaPagoFiado;
  }

  marcarComoPagado(fecha = new Date()) {
    this.estado = "PAGADO";
    this.montoPendiente = 0;
    this.fechaPagoFiado = fecha;
  }

  calcularDeuda() {
    return this.montoPendiente;
  }

  estaPendiente() {
    return this.estado === "PENDIENTE" && this.montoPendiente > 0;
  }
}
