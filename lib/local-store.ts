import { mockProducts } from "@/lib/mocks/products";

export type LocalCustomerRecord = {
  id: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  createdAt: string;
};

export type LocalOrderRecord = {
  id: string;
  clienteId: string;
  estadoPedido: string;
  estadoPago: string;
  adminSeen?: boolean;
  adminSeenAt?: string;
  origenPedido?: string;
  total: number;
  observacion?: string;
  fechaPedido: string;
  fechaEntrega?: string;
  fechaAgendado?: string;
  fechaCierre?: string;
  fechaCancelacion?: string;
  motivoCancelacion?: string;
};

export type LocalOrderItemRecord = {
  id: string;
  pedidoId: string;
  productoId?: string;
  productoNombre?: string;
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
