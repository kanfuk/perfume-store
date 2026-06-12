/**
 * Proyecto: Pauli Store
 * Modulo: Cliente
 * Descripcion: Entidad de dominio que representa a una persona que realiza pedidos.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

export type ClienteProps = {
  id?: string;
  nombre: string;
  telefono?: string;
  lugarTrabajo: string;
  createdAt?: Date;
};

export class Cliente {
  readonly id?: string;
  readonly createdAt: Date;
  private _nombre: string;
  private _telefono: string;
  private _lugarTrabajo: string;

  constructor(props: ClienteProps) {
    this.id = props.id;
    this.createdAt = props.createdAt ?? new Date();
    this._nombre = props.nombre.trim();
    this._telefono = (props.telefono ?? "").trim();
    this._lugarTrabajo = props.lugarTrabajo.trim();
    this.validarDatos();
  }

  get nombre() {
    return this._nombre;
  }

  get telefono() {
    return this._telefono;
  }

  get lugarTrabajo() {
    return this._lugarTrabajo;
  }

  validarDatos() {
    if (!this._nombre) {
      throw new Error("El nombre del cliente es obligatorio.");
    }

    if (!this._lugarTrabajo) {
      throw new Error("El lugar de trabajo es obligatorio.");
    }
  }

  actualizarDatos(data: Pick<ClienteProps, "nombre" | "telefono" | "lugarTrabajo">) {
    this._nombre = data.nombre.trim();
    this._telefono = (data.telefono ?? "").trim();
    this._lugarTrabajo = data.lugarTrabajo.trim();
    this.validarDatos();
  }

  obtenerResumen() {
    return `${this._nombre} - ${this._lugarTrabajo}`;
  }
}
