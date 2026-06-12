/**
 * Proyecto: Pauli Store
 * Modulo: DetallePedido
 * Descripcion: Entidad de dominio que representa un producto dentro de un pedido.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Producto } from "@/domain/Producto";

export type DetallePedidoProps = {
  producto: Producto;
  cantidad: number;
  precioUnitario?: number;
};

export class DetallePedido {
  readonly producto: Producto;
  readonly cantidad: number;
  readonly precioUnitario: number;
  readonly subtotal: number;

  constructor(props: DetallePedidoProps) {
    this.producto = props.producto;
    this.cantidad = props.cantidad;
    this.precioUnitario = props.precioUnitario ?? props.producto.precioVenta;
    this.validarCantidad();
    this.subtotal = this.calcularSubtotal();
  }

  calcularSubtotal() {
    return this.precioUnitario * this.cantidad;
  }

  validarCantidad() {
    if (this.cantidad < 1) {
      throw new Error("La cantidad debe ser al menos 1.");
    }
  }
}
