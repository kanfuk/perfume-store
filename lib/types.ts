export type OrderOrigin = "PUBLICO" | "ADMIN_DIRECTO" | "PERSONALIZADO";

export type ProductRecord = {
  id: string;
  nombre: string;
  descripcion?: string;
  precioVenta: number;
  imageUrl?: string;
  badgeLabel?: string;
  costoUnitario?: number;
  stockActual?: number;
  stockAgenda?: number;
  activo?: boolean;
  tipoProducto?: string;
};

export type AdminProductRecord = {
  id: string;
  nombre: string;
  descripcion: string;
  precioVenta: number;
  imageUrl?: string;
  badgeLabel?: string;
  costoUnitario: number;
  stockActual: number;
  stockAgenda: number;
  activo: boolean;
  tipoProducto: string;
  utilidadUnitaria: number;
};

export type CustomerOrderLineInput = {
  productoId: string;
  cantidad: number;
};

export type CustomerOrderRequest = {
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  fechaEntrega: string;
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
  telefono: string;
  lugarTrabajo: string;
};

export type CustomOrderRequest = {
  nombre: string;
  telefono?: string;
  lugarTrabajo?: string;
  nombreProducto: string;
  productoBaseId?: string;
  descripcion?: string;
  cantidad: number;
  precioAcordado: number;
  costoEstimadoTotal?: number;
  fechaEntrega?: string;
  estadoInicial: "AGENDADO" | "PAGADO" | "FIADO";
};

export type CustomerOrderResponse = {
  pedidoId: string;
  clienteId: string;
  total: number;
  estadoPedido: string;
  estadoPago: string;
  fechaEntrega?: string;
  origenPedido?: OrderOrigin;
  items: Array<{
    productoId: string;
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
  productoId: string;
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
  clienteId: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteLugarTrabajo: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  items: AdminOrderItemSummary[];
  estadoPedido: string;
  estadoPago: string;
  total: number;
  totalCost: number;
  grossProfit: number;
  fechaPedido: string;
  fechaEntrega?: string;
  fechaAgendado?: string;
  fechaCierre?: string;
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
};

export type AdminDashboardData = {
  pendientes: AdminOrderSummary[];
  agendados: AdminOrderSummary[];
  finalizados: AdminOrderSummary[];
  cancelados: AdminOrderSummary[];
  fiadosPendientes: AdminOrderSummary[];
  pedidosNuevos: number;
};

export type AdminOrdersAction =
  | "agendar"
  | "cancelar"
  | "pagado"
  | "fiado"
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
