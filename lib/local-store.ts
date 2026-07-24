import { mockProducts } from "@/lib/mocks/products";

export type LocalCustomerRecord = {
  id: string;
  nombre: string;
  rut?: string;
  email?: string;
  telefono: string;
  region?: string;
  comuna?: string;
  direccion?: string;
  referenciaDireccion?: string;
  /** Legado de Pauli Store, compatibilidad temporal. */
  lugarTrabajo: string;
  createdAt: string;
};

export type LocalOrderRecord = {
  id: string;
  codigo?: string;
  clienteId: string;
  estadoPedido: string;
  estadoPago: string;
  origenPedido?: string;
  subtotal: number;
  metodoDespacho?: string;
  costoDespacho: number;
  total: number;
  observacion?: string;
  motivoCancelacion?: string;
  stockRepuesto?: boolean;
  adminSeen?: boolean;
  adminSeenAt?: string;
  fechaPedido: string;
  fechaAgendado?: string;
  fechaPago?: string;
  fechaPreparacion?: string;
  fechaDespacho?: string;
  fechaEntrega?: string;
  fechaCancelacion?: string;
};

export type LocalOrderItemRecord = {
  id: string;
  pedidoId: string;
  productoId?: string | null;
  productoSku?: string;
  productoNombre?: string;
  productoMarca?: string;
  productoContenido?: string;
  productoDescripcion?: string;
  productoImageUrl?: string;
  productoTipo?: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  costoTotal: number;
  utilidadBruta: number;
  subtotal: number;
};

export type LocalPaymentRecord = {
  id: string;
  pedidoId: string;
  monto: number;
  metodoPago?: string;
  estadoPago: string;
  fechaPago: string;
};

export type LocalFiadoRecord = {
  id: string;
  pedidoId: string;
  clienteId: string;
  montoPendiente: number;
  estado: string;
  fechaFiado: string;
  fechaPagoFiado?: string;
};

export type LocalAdminOperationLog = {
  id: string;
  tipo: "CIERRE_MENSUAL" | "LIMPIEZA_PRELANZAMIENTO";
  periodo: string;
  ejecutadoPorEmail: string;
  ejecutadoPorNombre?: string | null;
  resumen: {
    pedidos: number;
    clientes: number;
    items: number;
    pagos: number;
    fiados: number;
    totalVentas: number;
  };
  createdAt: string;
};

export type LocalArchivedRecord<T> = {
  id: string;
  operacionId: string;
  originalId: string;
  payload: T;
  createdAt: string;
};

export const localStore = {
  customers: [] as LocalCustomerRecord[],
  orders: [] as LocalOrderRecord[],
  orderItems: [] as LocalOrderItemRecord[],
  payments: [] as LocalPaymentRecord[],
  fiados: [] as LocalFiadoRecord[],
  products: [...mockProducts],
  adminOperationLogs: [] as LocalAdminOperationLog[],
  archivedCustomers: [] as LocalArchivedRecord<LocalCustomerRecord>[],
  archivedOrders: [] as LocalArchivedRecord<LocalOrderRecord>[],
  archivedOrderItems: [] as LocalArchivedRecord<LocalOrderItemRecord>[],
  archivedPayments: [] as LocalArchivedRecord<LocalPaymentRecord>[],
  archivedFiados: [] as LocalArchivedRecord<LocalFiadoRecord>[]
};
