/**
 * Proyecto: Perfume Store
 * Modulo: Cierre semanal administrativo (Fase 7.6A)
 * Descripcion: Entidad de dominio INMUTABLE que representa una fotografia
 * historica ya calculada y persistida de un periodo semanal. A diferencia
 * de Cliente/Producto, esta entidad no tiene mutadores: reabrir un cierre
 * no modifica esta instancia, crea una fila nueva en el repositorio (la
 * version siguiente conserva su propia fotografia inmutable).
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

export const ESTADO_CIERRE_SEMANAL_CLOSED = "CLOSED";
export const ESTADO_CIERRE_SEMANAL_REOPENED = "REOPENED";

export const ESTADOS_CIERRE_SEMANAL = [
  ESTADO_CIERRE_SEMANAL_CLOSED,
  ESTADO_CIERRE_SEMANAL_REOPENED
] as const;

export type EstadoCierreSemanal = (typeof ESTADOS_CIERRE_SEMANAL)[number];

export function isEstadoCierreSemanal(value: string): value is EstadoCierreSemanal {
  return (ESTADOS_CIERRE_SEMANAL as readonly string[]).includes(value);
}

const MOTIVO_REAPERTURA_MIN_LENGTH = 5;
const MOTIVO_REAPERTURA_MAX_LENGTH = 500;

/** Metricas snapshot -- ver docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md para las definiciones exactas. */
export type CierreSemanalMetrics = {
  ordersCount: number;
  cancelledOrdersCount: number;
  pendingOrdersCount: number;
  deliveredOrdersCount: number;
  directSalesCount: number;
  grossSales: number;
  incomeAmount: number;
  costAmount: number;
  /** Puede ser negativo: una semana puede cerrar con perdida real. */
  profitAmount: number;
  outstandingAmount: number;
};

export type CierreSemanalProps = CierreSemanalMetrics & {
  id: string;
  periodStart: Date;
  periodEndExclusive: Date;
  version: number;
  status: EstadoCierreSemanal;
  snapshot: Record<string, unknown>;
  closedAt: Date;
  closedByEmail?: string | null;
  closedByNombre?: string | null;
  reopenedAt?: Date | null;
  reopenedByEmail?: string | null;
  reopenedByNombre?: string | null;
  reopenReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class CierreSemanal {
  readonly id: string;
  readonly periodStart: Date;
  readonly periodEndExclusive: Date;
  readonly version: number;
  readonly status: EstadoCierreSemanal;
  readonly ordersCount: number;
  readonly cancelledOrdersCount: number;
  readonly pendingOrdersCount: number;
  readonly deliveredOrdersCount: number;
  readonly directSalesCount: number;
  readonly grossSales: number;
  readonly incomeAmount: number;
  readonly costAmount: number;
  readonly profitAmount: number;
  readonly outstandingAmount: number;
  readonly snapshot: Record<string, unknown>;
  readonly closedAt: Date;
  readonly closedByEmail: string | null;
  readonly closedByNombre: string | null;
  readonly reopenedAt: Date | null;
  readonly reopenedByEmail: string | null;
  readonly reopenedByNombre: string | null;
  readonly reopenReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CierreSemanalProps) {
    validarCierreSemanal(props);

    this.id = props.id;
    this.periodStart = props.periodStart;
    this.periodEndExclusive = props.periodEndExclusive;
    this.version = props.version;
    this.status = props.status;
    this.ordersCount = props.ordersCount;
    this.cancelledOrdersCount = props.cancelledOrdersCount;
    this.pendingOrdersCount = props.pendingOrdersCount;
    this.deliveredOrdersCount = props.deliveredOrdersCount;
    this.directSalesCount = props.directSalesCount;
    this.grossSales = props.grossSales;
    this.incomeAmount = props.incomeAmount;
    this.costAmount = props.costAmount;
    this.profitAmount = props.profitAmount;
    this.outstandingAmount = props.outstandingAmount;
    this.snapshot = props.snapshot;
    this.closedAt = props.closedAt;
    this.closedByEmail = props.closedByEmail ?? null;
    this.closedByNombre = props.closedByNombre ?? null;
    this.reopenedAt = props.reopenedAt ?? null;
    this.reopenedByEmail = props.reopenedByEmail ?? null;
    this.reopenedByNombre = props.reopenedByNombre ?? null;
    this.reopenReason = props.reopenReason ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get estaCerrado(): boolean {
    return this.status === ESTADO_CIERRE_SEMANAL_CLOSED;
  }

  get estaReabierto(): boolean {
    return this.status === ESTADO_CIERRE_SEMANAL_REOPENED;
  }
}

function validarFecha(value: Date, campo: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${campo} no es una fecha valida.`);
  }
}

function validarEntero(value: number, campo: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${campo} debe ser un entero no negativo.`);
  }
}

function validarMonto(value: number, campo: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${campo} debe ser un monto finito no negativo.`);
  }
}

function validarCierreSemanal(props: CierreSemanalProps) {
  validarFecha(props.periodStart, "El inicio del periodo");
  validarFecha(props.periodEndExclusive, "El fin del periodo");

  if (props.periodStart.getTime() >= props.periodEndExclusive.getTime()) {
    throw new Error("El periodo del cierre no es valido: el inicio debe ser anterior al fin.");
  }

  if (!Number.isInteger(props.version) || props.version <= 0) {
    throw new Error("La version del cierre debe ser un entero positivo.");
  }

  if (!isEstadoCierreSemanal(props.status)) {
    throw new Error("El estado del cierre no es valido.");
  }

  validarEntero(props.ordersCount, "El conteo de pedidos");
  validarEntero(props.cancelledOrdersCount, "El conteo de cancelados");
  validarEntero(props.pendingOrdersCount, "El conteo de pendientes");
  validarEntero(props.deliveredOrdersCount, "El conteo de entregados");
  validarEntero(props.directSalesCount, "El conteo de ventas directas");

  validarMonto(props.grossSales, "El monto de ventas");
  validarMonto(props.incomeAmount, "El monto de ingresos");
  validarMonto(props.costAmount, "El monto de costos");
  validarMonto(props.outstandingAmount, "El saldo pendiente");

  // La utilidad SI puede ser negativa (perdida real de la semana) -- solo
  // se exige que sea un numero finito, nunca NaN/Infinity.
  if (!Number.isFinite(props.profitAmount)) {
    throw new Error("El monto de utilidad debe ser un numero finito.");
  }

  validarFecha(props.closedAt, "La fecha de cierre");

  if (props.reopenedAt !== null && props.reopenedAt !== undefined) {
    validarFecha(props.reopenedAt, "La fecha de reapertura");
  }

  if (props.status === ESTADO_CIERRE_SEMANAL_REOPENED && !props.reopenReason?.trim()) {
    throw new Error("Un cierre reabierto debe conservar el motivo de reapertura.");
  }
}

/**
 * Valida el motivo de reapertura (Fase 7.6A): obligatorio, string, trim,
 * entre 5 y 500 caracteres. Mismo criterio que el motivo de bloqueo de
 * clientes (domain/Cliente.ts / services/adminCustomerService.ts).
 */
export function validarMotivoReapertura(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("El motivo de reapertura es obligatorio.");
  }

  const motivo = raw.trim();

  if (!motivo) {
    throw new Error("El motivo de reapertura es obligatorio.");
  }

  if (motivo.length < MOTIVO_REAPERTURA_MIN_LENGTH) {
    throw new Error(`El motivo de reapertura debe tener al menos ${MOTIVO_REAPERTURA_MIN_LENGTH} caracteres.`);
  }

  if (motivo.length > MOTIVO_REAPERTURA_MAX_LENGTH) {
    throw new Error(`El motivo de reapertura no puede superar los ${MOTIVO_REAPERTURA_MAX_LENGTH} caracteres.`);
  }

  return motivo;
}
