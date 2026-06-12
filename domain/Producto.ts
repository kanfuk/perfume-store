/**
 * Proyecto: Pauli Store
 * Modulo: Producto
 * Descripcion: Entidad de dominio que representa un producto vendible.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

export type ProductoProps = {
  id: string;
  nombre: string;
  descripcion?: string;
  precioVenta: number;
  costoUnitario?: number;
  stockActual?: number;
  activo?: boolean;
  tipoProducto?: string;
};

export class Producto {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly tipoProducto: string;
  private _precioVenta: number;
  private _costoUnitario: number;
  private _stockActual: number;
  private _activo: boolean;

  constructor(props: ProductoProps) {
    this.id = props.id;
    this.nombre = props.nombre.trim();
    this.descripcion = (props.descripcion ?? "").trim();
    this.tipoProducto = (props.tipoProducto ?? "simple").trim();
    this._precioVenta = props.precioVenta;
    this._costoUnitario = props.costoUnitario ?? 0;
    this._stockActual = props.stockActual ?? 0;
    this._activo = props.activo ?? true;
    this.validarProducto();
  }

  get precioVenta() {
    return this._precioVenta;
  }

  get costoUnitario() {
    return this._costoUnitario;
  }

  get stockActual() {
    return this._stockActual;
  }

  get activo() {
    return this._activo;
  }

  calcularUtilidadUnitaria() {
    return this._precioVenta - this._costoUnitario;
  }

  actualizarPrecio(precioVenta: number) {
    this._precioVenta = precioVenta;
    this.validarProducto();
  }

  actualizarCosto(costoUnitario: number) {
    this._costoUnitario = costoUnitario;
    this.validarProducto();
  }

  activar() {
    this._activo = true;
  }

  desactivar() {
    this._activo = false;
  }

  validarProducto() {
    if (!this.nombre) {
      throw new Error("El nombre del producto es obligatorio.");
    }

    if (this._precioVenta < 0) {
      throw new Error("El precio de venta no puede ser negativo.");
    }

    if (this._costoUnitario < 0) {
      throw new Error("El costo unitario no puede ser negativo.");
    }
  }

  obtenerDescripcionComercial() {
    return this.descripcion || this.nombre;
  }
}
