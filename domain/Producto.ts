/**
 * Proyecto: Perfume Store
 * Modulo: Producto
 * Descripcion: Entidad de dominio que representa un producto vendible (perfume).
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

export type ProductoProps = {
  id: string;
  sku?: string;
  nombre: string;
  marca?: string;
  contenido?: string;
  descripcion?: string;
  precioVenta: number;
  precioAnterior?: number;
  imageUrl?: string;
  imageStoragePath?: string;
  badgeLabel?: string;
  costoUnitario?: number;
  stockActual?: number;
  /** Legado de Pauli Store: espejo de stockActual mantenido por el repositorio. */
  stockAgenda?: number;
  stockReservado?: number;
  stockMinimo?: number;
  activo?: boolean;
  esTop?: boolean;
  esOfertaSemana?: boolean;
  ordenDestacado?: number;
  tipoProducto?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class Producto {
  readonly id: string;
  readonly sku: string;
  readonly nombre: string;
  readonly marca: string;
  readonly contenido: string;
  readonly descripcion: string;
  readonly imageUrl: string;
  readonly imageStoragePath: string;
  readonly badgeLabel: string;
  readonly tipoProducto: string;
  readonly ordenDestacado?: number;
  readonly createdAt?: Date;
  private _precioVenta: number;
  private _precioAnterior?: number;
  private _costoUnitario: number;
  private _stockActual: number;
  private _stockAgenda: number;
  private _stockReservado: number;
  private _stockMinimo: number;
  private _activo: boolean;
  private _esTop: boolean;
  private _esOfertaSemana: boolean;

  constructor(props: ProductoProps) {
    this.id = props.id;
    this.sku = (props.sku ?? "").trim();
    this.nombre = props.nombre.trim();
    this.marca = (props.marca ?? "").trim();
    this.contenido = (props.contenido ?? "").trim();
    this.descripcion = (props.descripcion ?? "").trim();
    this.imageUrl = (props.imageUrl ?? "").trim();
    this.imageStoragePath = (props.imageStoragePath ?? "").trim();
    this.badgeLabel = (props.badgeLabel ?? "").trim();
    this.tipoProducto = (props.tipoProducto ?? "simple").trim();
    this.ordenDestacado = props.ordenDestacado;
    this.createdAt = props.createdAt;
    this._precioVenta = props.precioVenta;
    this._precioAnterior = props.precioAnterior;
    this._costoUnitario = props.costoUnitario ?? 0;
    this._stockActual = props.stockActual ?? 0;
    this._stockAgenda = props.stockAgenda ?? props.stockActual ?? 0;
    this._stockReservado = props.stockReservado ?? 0;
    this._stockMinimo = props.stockMinimo ?? 0;
    this._activo = props.activo ?? true;
    this._esTop = props.esTop ?? false;
    this._esOfertaSemana = props.esOfertaSemana ?? false;
    this.validarProducto();
  }

  get precioVenta() {
    return this._precioVenta;
  }

  get precioAnterior() {
    return this._precioAnterior;
  }

  get costoUnitario() {
    return this._costoUnitario;
  }

  get stockActual() {
    return this._stockActual;
  }

  get stockAgenda() {
    return this._stockAgenda;
  }

  get stockReservado() {
    return this._stockReservado;
  }

  get stockMinimo() {
    return this._stockMinimo;
  }

  get activo() {
    return this._activo;
  }

  get esTop() {
    return this._esTop;
  }

  get esOfertaSemana() {
    return this._esOfertaSemana;
  }

  calcularUtilidadUnitaria() {
    return this._precioVenta - this._costoUnitario;
  }

  actualizarPrecio(precioVenta: number, precioAnterior?: number) {
    this._precioVenta = precioVenta;
    this._precioAnterior = precioAnterior;
    this.validarProducto();
  }

  actualizarCosto(costoUnitario: number) {
    this._costoUnitario = costoUnitario;
    this.validarProducto();
  }

  actualizarStockActual(stockActual: number) {
    this._stockActual = stockActual;
    this._stockAgenda = stockActual;
    this.validarProducto();
  }

  activar() {
    this._activo = true;
  }

  desactivar() {
    this._activo = false;
  }

  marcarTop(esTop: boolean) {
    this._esTop = esTop;
  }

  marcarOfertaSemana(esOfertaSemana: boolean) {
    this._esOfertaSemana = esOfertaSemana;
  }

  validarProducto() {
    if (!this.nombre) {
      throw new Error("El nombre del producto es obligatorio.");
    }

    if (this._precioVenta < 0) {
      throw new Error("El precio de venta no puede ser negativo.");
    }

    if (this._precioAnterior !== undefined && this._precioAnterior < 0) {
      throw new Error("El precio anterior no puede ser negativo.");
    }

    if (this._costoUnitario < 0) {
      throw new Error("El costo unitario no puede ser negativo.");
    }

    if (this._stockActual < 0 || this._stockAgenda < 0) {
      throw new Error("El stock no puede ser negativo.");
    }

    if (this._stockReservado < 0) {
      throw new Error("El stock reservado no puede ser negativo.");
    }
  }

  obtenerDescripcionComercial() {
    return this.descripcion || this.nombre;
  }
}
