/**
 * Proyecto: Perfume Store
 * Modulo: Cliente
 * Descripcion: Entidad de dominio que representa a una persona que realiza pedidos.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

export type ClienteProps = {
  id?: string;
  nombre: string;
  rut?: string;
  email?: string;
  telefono?: string;
  region?: string;
  comuna?: string;
  direccion?: string;
  referenciaDireccion?: string;
  /** Legado de Pauli Store (venta informal). No usar como direccion. */
  lugarTrabajo?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class Cliente {
  readonly id?: string;
  readonly createdAt: Date;
  private _nombre: string;
  private _rut: string;
  private _email: string;
  private _telefono: string;
  private _region: string;
  private _comuna: string;
  private _direccion: string;
  private _referenciaDireccion: string;
  private _lugarTrabajo: string;
  private _updatedAt: Date;

  constructor(props: ClienteProps) {
    this.id = props.id;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? this.createdAt;
    this._nombre = props.nombre.trim();
    this._rut = (props.rut ?? "").trim();
    this._email = (props.email ?? "").trim();
    this._telefono = (props.telefono ?? "").trim();
    this._region = (props.region ?? "").trim();
    this._comuna = (props.comuna ?? "").trim();
    this._direccion = (props.direccion ?? "").trim();
    this._referenciaDireccion = (props.referenciaDireccion ?? "").trim();
    this._lugarTrabajo = (props.lugarTrabajo ?? "").trim();
    this.validarDatos();
  }

  get nombre() {
    return this._nombre;
  }

  get rut() {
    return this._rut;
  }

  get email() {
    return this._email;
  }

  get telefono() {
    return this._telefono;
  }

  get region() {
    return this._region;
  }

  get comuna() {
    return this._comuna;
  }

  get direccion() {
    return this._direccion;
  }

  get referenciaDireccion() {
    return this._referenciaDireccion;
  }

  /** Legado de Pauli Store. No usar como direccion de despacho. */
  get lugarTrabajo() {
    return this._lugarTrabajo;
  }

  get updatedAt() {
    return this._updatedAt;
  }

  validarDatos() {
    if (!this._nombre) {
      throw new Error("El nombre del cliente es obligatorio.");
    }
  }

  actualizarDatos(
    data: Partial<
      Pick<
        ClienteProps,
        | "nombre"
        | "rut"
        | "email"
        | "telefono"
        | "region"
        | "comuna"
        | "direccion"
        | "referenciaDireccion"
        | "lugarTrabajo"
      >
    >
  ) {
    if (data.nombre !== undefined) this._nombre = data.nombre.trim();
    if (data.rut !== undefined) this._rut = data.rut.trim();
    if (data.email !== undefined) this._email = data.email.trim();
    if (data.telefono !== undefined) this._telefono = data.telefono.trim();
    if (data.region !== undefined) this._region = data.region.trim();
    if (data.comuna !== undefined) this._comuna = data.comuna.trim();
    if (data.direccion !== undefined) this._direccion = data.direccion.trim();
    if (data.referenciaDireccion !== undefined)
      this._referenciaDireccion = data.referenciaDireccion.trim();
    if (data.lugarTrabajo !== undefined) this._lugarTrabajo = data.lugarTrabajo.trim();
    this._updatedAt = new Date();
    this.validarDatos();
  }

  tieneDireccionDespacho() {
    return Boolean(this._region && this._comuna && this._direccion);
  }

  obtenerResumen() {
    if (this.tieneDireccionDespacho()) {
      return `${this._nombre} - ${this._comuna}, ${this._region}`;
    }

    return this._lugarTrabajo ? `${this._nombre} - ${this._lugarTrabajo}` : this._nombre;
  }
}
