import type {
  AdminView,
  ReportRangePreset,
  ReportSalesFilter,
  StatusFilter
} from "@/components/admin/dashboard/admin-dashboard.types";

export const PENDING_ORDERS_REFRESH_MS = 60000;

export const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "pendientes", label: "Pendientes" },
  { value: "agendados", label: "Agendados" },
  { value: "historial", label: "Historial" }
];

export const reportRangeOptions: Array<{ value: ReportRangePreset; label: string }> = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
  { value: "last-month", label: "Mes anterior" },
  { value: "custom", label: "Personalizado" }
];

export const reportSalesOptions: Array<{ value: ReportSalesFilter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "pedido-cliente", label: "Pedidos cliente" },
  { value: "venta-directa", label: "Venta directa" },
  { value: "venta-personalizada", label: "Venta personalizada" }
];

export const ADMIN_VIEW_ROUTES: Record<AdminView, string> = {
  home: "/admin",
  agenda: "/admin/pedidos",
  stock: "/admin/stock",
  cobros: "/admin/ventas",
  clientes: "/admin/clientes",
  reportes: "/admin/reportes"
};

export const PENDING_ORDERS_SECTION_ID = "agenda-pendientes";
export const SCHEDULED_ORDERS_SECTION_ID = "agenda-agendados";

export const ADMIN_VIEW_META: Record<
  AdminView,
  {
    title: string;
    description: string;
  }
> = {
  home: {
    title: "Centro de control",
    description:
      "Resumen rapido y accesos claros para revisar pedidos, stock, ventas y clientes sin perderte."
  },
  agenda: {
    title: "Pedidos",
    description:
      "Revisa pendientes, agenda entregas y vuelve al inicio cuando termines."
  },
  stock: {
    title: "Stock",
    description:
      "Ajusta catalogo, stock, precios e imagenes desde una vista propia y ordenada."
  },
  cobros: {
    title: "Ventas",
    description:
      "Cierra pedidos, revisa fiados y deja solo las acciones relevantes del flujo real."
  },
  clientes: {
    title: "Clientes",
    description:
      "Consulta historial reciente y vuelve al panel principal con gesto del navegador o Inicio."
  },
  reportes: {
    title: "Reportes",
    description:
      "Mira solo los numeros importantes desde una vista independiente y clara."
  }
};
