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
  /** Banlist (Fase 7.5A): fuente de verdad sobre si el cliente puede generar pedidos publicos. */
  bloqueado?: boolean;
  /** Exclusivamente administrativo -- nunca se expone al cliente. Se conserva tras desbloquear. */
  motivoBloqueo?: string | null;
  /** Fecha del ULTIMO bloqueo; se conserva aunque el cliente se desbloquee despues. */
  bloqueadoEn?: Date | null;
  /** Fecha del ultimo desbloqueo; null mientras el cliente sigue bloqueado. */
  desbloqueadoEn?: Date | null;
  /** userId (Supabase Auth) del admin que bloqueo por ultima vez. Nunca correo/nombre como clave. */
  bloqueadoPor?: string | null;
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
  private _bloqueado: boolean;
  private _motivoBloqueo: string | null;
  private _bloqueadoEn: Date | null;
  private _desbloqueadoEn: Date | null;
  private _bloqueadoPor: string | null;

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
    this._bloqueado = props.bloqueado ?? false;
    this._motivoBloqueo = props.motivoBloqueo ?? null;
    this._bloqueadoEn = props.bloqueadoEn ?? null;
    this._desbloqueadoEn = props.desbloqueadoEn ?? null;
    this._bloqueadoPor = props.bloqueadoPor ?? null;
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

  get bloqueado() {
    return this._bloqueado;
  }

  get motivoBloqueo() {
    return this._motivoBloqueo;
  }

  get bloqueadoEn() {
    return this._bloqueadoEn;
  }

  get desbloqueadoEn() {
    return this._desbloqueadoEn;
  }

  get bloqueadoPor() {
    return this._bloqueadoPor;
  }

  validarDatos() {
    if (!this._nombre) {
      throw new Error("El nombre del cliente es obligatorio.");
    }
  }

  /**
   * Banlist (Fase 7.5A): marca al cliente como bloqueado. La validacion del
   * motivo (obligatorio, trim, 5-500 caracteres) es responsabilidad del
   * servicio (services/adminCustomerService.ts), no de esta entidad -- este
   * metodo solo aplica el cambio de estado, igual que Producto.activar()/
   * desactivar() no validan reglas de negocio de stock. Idempotente: volver
   * a bloquear a alguien ya bloqueado solo actualiza el motivo si se envia
   * uno nuevo y refresca bloqueadoEn/bloqueadoPor.
   */
  bloquear(motivo: string, bloqueadoPor: string | null) {
    this._bloqueado = true;
    this._motivoBloqueo = motivo;
    this._bloqueadoEn = new Date();
    this._desbloqueadoEn = null;
    this._bloqueadoPor = bloqueadoPor;
    this._updatedAt = new Date();
  }

  /**
   * Banlist: retira el bloqueo. Conserva motivoBloqueo y bloqueadoEn como
   * referencia administrativa del ultimo bloqueo (nunca se borran).
   * Idempotente sobre un cliente ya desbloqueado.
   */
  desbloquear() {
    this._bloqueado = false;
    this._desbloqueadoEn = new Date();
    this._updatedAt = new Date();
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
