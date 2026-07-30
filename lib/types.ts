import type { EstadoPago, EstadoPedido, MetodoDespacho } from "@/lib/constants";
import type { ModoPrecio } from "@/domain/Producto";

export type OrderOrigin = "PUBLICO" | "ADMIN_DIRECTO" | "PERSONALIZADO";

export type ProductRecord = {
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
  /** Legado de Pauli Store, mantenido en sincronia con stockActual. */
  stockAgenda?: number;
  stockReservado?: number;
  stockMinimo?: number;
  activo?: boolean;
  esTop?: boolean;
  esOfertaSemana?: boolean;
  ordenDestacado?: number;
  tipoProducto?: string;
  modoPrecio?: ModoPrecio;
};

export type AdminProductRecord = {
  id: string;
  sku?: string;
  nombre: string;
  marca?: string;
  contenido?: string;
  descripcion: string;
  precioVenta: number;
  precioAnterior?: number;
  imageUrl?: string;
  imageStoragePath?: string;
  badgeLabel?: string;
  costoUnitario: number;
  stockActual: number;
  stockAgenda: number;
  stockReservado: number;
  stockMinimo: number;
  activo: boolean;
  esTop: boolean;
  esOfertaSemana: boolean;
  ordenDestacado?: number;
  tipoProducto: string;
  utilidadUnitaria: number;
  modoPrecio: ModoPrecio;
};

export type CustomerOrderLineInput = {
  productoId: string;
  cantidad: number;
};

/**
 * Datos de despacho que hoy exige el negocio de perfumes. lugarTrabajo NO se
 * usa como direccion: es un campo legado que solo aparece en flujos admin
 * heredados (venta directa, pedido personalizado).
 */
export type CustomerOrderRequest = {
  nombre: string;
  rut: string;
  email: string;
  telefono: string;
  region: string;
  comuna: string;
  direccion: string;
  referenciaDireccion?: string;
  metodoDespacho: MetodoDespacho;
  observacion?: string;
  items: CustomerOrderLineInput[];
  contactoOculto?: string;
};

export type AdminDirectSaleRequest = {
  clienteId?: string;
  nombre?: string;
  telefono?: string;
  lugarTrabajo?: string;
  items: CustomerOrderLineInput[];
  estadoPago: "PAGADO" | "FIADO";
  clienteModo: "ocasional" | "existente" | "nuevo";
  observacion?: string;
};

export type AdminCustomerOption = {
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
};

export type CustomOrderRequest = {
  clienteId?: string;
  nombre: string;
  telefono?: string;
  lugarTrabajo?: string;
  nombreProducto: string;
  productoBaseId?: string;
  descripcion?: string;
  cantidad: number;
  precioAcordado: number;
  costoEstimadoTotal?: number;
  estadoInicial: "NUEVO" | "AGENDADO" | "PAGADO";
};

export type CustomerOrderResponse = {
  pedidoId: string;
  codigo?: string;
  clienteId: string;
  subtotal: number;
  costoDespacho: number;
  total: number;
  estadoPedido: string;
  estadoPago: string;
  metodoDespacho?: MetodoDespacho;
  origenPedido?: OrderOrigin;
  items: Array<{
    productoId: string | null;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    costoUnitario: number;
    costoTotal: number;
    utilidadBruta: number;
    subtotal: number;
  }>;
};

export type AdminOrderItemSummary = {
  productoId: string | null;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  costoTotal: number;
  utilidadBruta: number;
  subtotal: number;
};

export type AdminOrderSummary = {
  id: string;
  codigo?: string;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteLugarTrabajo: string;
  clienteRut?: string;
  clienteEmail?: string;
  clienteRegion?: string;
  clienteComuna?: string;
  clienteDireccion?: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  items: AdminOrderItemSummary[];
  estadoPedido: EstadoPedido | string;
  estadoPago: EstadoPago | string;
  metodoDespacho?: MetodoDespacho | string;
  costoDespacho?: number;
  total: number;
  totalCost: number;
  grossProfit: number;
  fechaPedido: string;
  fechaAgendado?: string;
  fechaPago?: string;
  fechaPreparacion?: string;
  fechaDespacho?: string;
  fechaEntrega?: string;
  fechaCancelacion?: string;
  motivoCancelacion?: string;
  totalPagado: number;
  saldoPendiente: number;
  pagosRegistrados: number;
  fechaUltimoPago?: string;
  fiadoEstado?: string;
  fechaFiado?: string;
  fechaPagoFiado?: string;
  adminSeen?: boolean;
  adminSeenAt?: string;
  origenPedido?: OrderOrigin;
  observacion?: string;
  stockRepuesto?: boolean;
};

export type AdminDashboardData = {
  /** Pedidos en estado NUEVO (no confirmados aun). */
  pendientes: AdminOrderSummary[];
  /** Pedidos en estado AGENDADO. */
  agendados: AdminOrderSummary[];
  /** Pedidos en estado ENTREGADO (cierre exitoso del ciclo). */
  finalizados: AdminOrderSummary[];
  /** Pedidos en estado CANCELADO. */
  cancelados: AdminOrderSummary[];
  fiadosPendientes: AdminOrderSummary[];
  pedidosNuevos: number;
};

export type AdminBadgeDeviceSetting = {
  id?: string;
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  badgeEnabled: boolean;
  badgeSupported: boolean;
  notificationPermission?: NotificationPermission | "unsupported";
  runningAsPwa?: boolean;
  lastBadgeCount: number;
  lastSyncAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminPushSubscriptionRecord = {
  id?: string;
  userId: string;
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel?: string;
  notificationPermission?: NotificationPermission | "unsupported";
  runningAsPwa?: boolean;
  isActive: boolean;
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminOrdersAction =
  | "agendar"
  | "pagado"
  | "preparando"
  | "despachado"
  | "entregado"
  | "cancelar"
  | "abonar"
  | "visto";

export type AdminPageData = {
  dashboard: AdminDashboardData;
  productos: AdminProductRecord[];
};

export type AdminMaintenanceAction = "close-month" | "clear-test-data";

export type AdminMaintenanceSummary = {
  pedidos: number;
  clientes: number;
  items: number;
  pagos: number;
  fiados: number;
  totalVentas: number;
};

export type AdminMaintenanceResult = {
  operationId: string;
  tipo: "CIERRE_MENSUAL" | "LIMPIEZA_PRELANZAMIENTO";
  periodo: string;
  resumen: AdminMaintenanceSummary;
  message: string;
};
