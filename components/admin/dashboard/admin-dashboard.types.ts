import type {
  AdminCustomerOption,
  AdminOrderSummary,
  AdminOrdersAction,
  AdminPageData
} from "@/lib/types";

export type AdminView =
  | "home"
  | "agenda"
  | "cobros"
  | "clientes"
  | "reportes";

export type StatusFilter = "pendientes" | "agendados" | "historial";
export type StockFilter = "todos" | "activos" | "pausados";
export type CustomerFilter = "todos" | "con-pedidos" | "con-fiado" | "recientes" | "bloqueados";
export type ReportTab = "resumen" | "rentabilidad";
export type ReportRangePreset = "today" | "week" | "month" | "last-month" | "custom";
export type ReportSalesFilter =
  | "todos"
  | "pedido-cliente"
  | "venta-directa"
  | "venta-personalizada";

export type OrderModalState =
  | { type: "agendar"; order: AdminOrderSummary }
  | { type: "pagado"; order: AdminOrderSummary }
  | { type: "cancelar"; order: AdminOrderSummary }
  | { type: "abonar"; order: AdminOrderSummary }
  | null;

/**
 * "reenviar-transferencia" y "coordinar-entrega" son acciones de solo
 * lectura del contrato de la API (nunca mutan el pedido, solo reconstruyen
 * un mensaje de WhatsApp desde el snapshot persistido) - ver
 * AdminOrdersAction en lib/types.ts.
 */
export type OrderSectionActionKey = AdminOrdersAction;

export type StockDraft = {
  stock: string;
  precioVenta: string;
  tipoProducto: string;
  activo: "activo" | "pausado";
};

export type CustomerCardData = {
  clienteId: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  pedidos: number;
  pendiente: number;
  totalComprado: number;
  ultimoMovimiento: string;
  proximasFechas: string[];
  pedidosActivos: number;
  pedidosFinalizados: number;
  isRecent: boolean;
  /** Banlist (Fase 7.5A). */
  bloqueado: boolean;
  motivoBloqueo?: string;
  bloqueadoEn?: string;
  desbloqueadoEn?: string;
};

export type CustomerEditModalState =
  | {
      customer: AdminCustomerOption;
    }
  | null;

/** Banlist (Fase 7.5A): modal dedicado para capturar el motivo obligatorio del bloqueo. */
export type CustomerBlockModalState =
  | {
      customer: CustomerCardData;
    }
  | null;

export type GroupedFiadoCustomer = {
  clienteId: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  totalPendiente: number;
  cantidadFiados: number;
  fiados: AdminOrderSummary[];
};

export type WhatsAppFallbackState = {
  message: string;
  url?: string;
  reason: "ready" | "invalid-phone";
  orderId: string;
  action: AdminOrdersAction;
};

export type ProfitabilityCostStatus = "real" | "estimated" | "missing";

export type ResolvedProfitabilityCost = {
  status: ProfitabilityCostStatus;
  unitCost: number;
  totalCost: number;
  profit: number;
};

export type AdminDashboardProps = {
  initialData: AdminPageData;
  initialView?: AdminView;
  initialCustomers?: AdminCustomerOption[];
  isOwner?: boolean;
};

export type OrderSectionProps = {
  htmlId?: string;
  title: string;
  subtitle: string;
  orders: AdminOrderSummary[];
  loading: boolean;
  emptyText: string;
  busyOrderId: string;
  selectedOrderId: string;
  actions: Array<{
    key: OrderSectionActionKey;
    label: string;
    tone: "primary" | "warning" | "muted";
    disabled?: boolean;
  }>;
  onSelect: (orderId: string) => void;
  onAction: (order: AdminOrderSummary, action: OrderSectionActionKey) => void;
};
