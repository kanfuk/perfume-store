import {
  Boxes,
  CalendarRange,
  ClipboardList,
  Home,
  LayoutGrid,
  Settings,
  ShoppingBag,
  UploadCloud,
  UserRound,
  Wrench,
  type LucideIcon
} from "lucide-react";
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
  cobros: "/admin/ventas",
  clientes: "/admin/clientes",
  reportes: "/admin/reportes"
};

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Fuente unica de la navegacion principal: la reutilizan la barra inferior
 * (movil) y la barra compacta (escritorio) para que exista un solo lugar
 * donde agregar, quitar o reordenar destinos. Todos son rutas reales
 * (<Link>): ninguno depende de cambiar `view` en el cliente para decidir que
 * mostrar, asi se evita el salto entre pantallas al navegar.
 */
export const ADMIN_PRIMARY_NAV: AdminNavItem[] = [
  { id: "home", label: "Inicio", href: "/admin", icon: Home },
  { id: "agenda", label: "Pedidos", href: "/admin/pedidos", icon: ClipboardList },
  { id: "venta", label: "Venta", href: "/admin/venta-directa", icon: ShoppingBag },
  { id: "stock", label: "Stock", href: "/admin/catalogo/stock", icon: Boxes }
];

/** "Más": mismas secciones secundarias para el menú de escritorio y la hoja móvil. */
export const ADMIN_MORE_NAV: AdminNavItem[] = [
  { id: "catalogo", label: "Catálogo", href: "/admin/catalogo", icon: LayoutGrid },
  { id: "clientes", label: "Clientes", href: "/admin/clientes", icon: UserRound },
  { id: "reportes", label: "Reportes", href: "/admin/reportes", icon: CalendarRange },
  { id: "importar", label: "Importar catálogo", href: "/admin/importar-catalogo", icon: UploadCloud },
  { id: "configuracion", label: "Configuración", href: "/admin/configuracion", icon: Settings },
  { id: "mantenimiento", label: "Mantenimiento", href: "/admin/mantenimiento", icon: Wrench }
];

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
