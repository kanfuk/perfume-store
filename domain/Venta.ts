/**
 * Proyecto: Pauli Store
 * Modulo: Venta
 * Descripcion: Entidad de dominio que resume una venta finalizada y su utilidad.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Pedido } from "@/domain/Pedido";

export type VentaProps = {
  id?: string;
  pedido: Pedido;
  fechaVenta?: Date;
};

export class Venta {
  readonly id?: string;
  readonly pedido: Pedido;
  readonly fechaVenta: Date;
  readonly totalVenta: number;
  readonly totalCosto: number;
  readonly utilidad: number;

  constructor(props: VentaProps) {
    this.id = props.id;
    this.pedido = props.pedido;
    this.fechaVenta = props.fechaVenta ?? new Date();
    this.totalVenta = props.pedido.total;
    this.totalCosto = this.calcularCostoTotal();
    this.utilidad = this.calcularUtilidad();
  }

  calcularCostoTotal() {
    return this.pedido.items.reduce(
      (sum, item) => sum + item.producto.costoUnitario * item.cantidad,
      0
    );
  }

  calcularUtilidad() {
    return this.totalVenta - this.totalCosto;
  }

  generarResumen() {
    return {
      totalVenta: this.totalVenta,
      totalCosto: this.totalCosto,
      utilidad: this.utilidad
    };
  }
}
