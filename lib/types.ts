export type ProductRecord = {
  id: string;
  nombre: string;
  descripcion?: string;
  precioVenta: number;
  imageUrl?: string;
  costoUnitario?: number;
  stockActual?: number;
  activo?: boolean;
  tipoProducto?: string;
};

export type AdminProductRecord = {
  id: string;
  nombre: string;
  descripcion: string;
  precioVenta: number;
  imageUrl?: string;
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
  items: CustomerOrderLineInput[];
  contactoOculto?: string;
};

export type CustomerOrderResponse = {
  pedidoId: string;
  clienteId: string;
  total: number;
  estadoPedido: string;
  estadoPago: string;
  items: Array<{
    productoId: string;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }>;
};

export type AdminOrderItemSummary = {
  productoId: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
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
};

export type AdminDashboardData = {
  pendientes: AdminOrderSummary[];
  agendados: AdminOrderSummary[];
  finalizados: AdminOrderSummary[];
  cancelados: AdminOrderSummary[];
  fiadosPendientes: AdminOrderSummary[];
};

export type AdminOrdersAction = "agendar" | "cancelar" | "pagado" | "fiado" | "abonar";

export type AdminPageData = {
  dashboard: AdminDashboardData;
  productos: AdminProductRecord[];
};
