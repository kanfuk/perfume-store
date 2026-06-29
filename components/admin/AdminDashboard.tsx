"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
  Bell,
  BellRing,
  Box,
  Boxes,
  CalendarClock,
  CalendarRange,
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  HandCoins,
  Home,
  LayoutGrid,
  MessageCircle,
  Package2,
  PencilLine,
  Phone,
  Plus,
  KeyRound,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  WalletCards
} from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { AdminNotificationBadge } from "@/components/admin/AdminNotificationBadge";
import { ProductImage } from "@/components/ProductImage";
import { WhatsAppFloatingButton } from "@/components/shared/WhatsAppFloatingButton";
import { paymentInfo } from "@/config/paymentInfo";
import {
  getNewAdminOrders,
  getNewAdminOrdersCount
} from "@/lib/admin/getPendingAdminOrders";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import { formatCurrency } from "@/lib/format";
import {
  getNotificationPermissionState,
  isAppBadgeSupported,
  isRunningAsInstalledPwa,
  requestBadgePermissionForCurrentDevice
} from "@/lib/pwa/notifications";
import { getOrCreateDeviceId } from "@/lib/pwa/device";
import {
  isPushNotificationsSupported,
  sendCurrentDevicePushTest,
  subscribeCurrentDeviceToPush
} from "@/lib/pwa/push";
import { updateAppBadge } from "@/lib/pwa/updateAppBadge";
import { normalizeChilePhone } from "@/lib/phone/normalizeChilePhone";
import { getUnifiedProductStock, normalizeStockValue } from "@/lib/stock";
import { buildAdminOrderAlertMessage } from "@/lib/whatsapp/buildAdminOrderAlertMessage";
import { buildOrderConfirmationMessage } from "@/lib/whatsapp/buildOrderConfirmationMessage";
import { buildDebtCollectionMessage } from "@/lib/whatsapp/buildDebtCollectionMessage";
import { buildWhatsAppManualUrl } from "@/lib/whatsapp/buildWhatsAppManualUrl";
import { buildWhatsAppShareUrl } from "@/lib/whatsapp/buildWhatsAppShareUrl";
import { createNotificationService } from "@/services/NotificationService";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  formatChileDateOnly,
  formatChileDateTime,
  getChileTodayInputValue
} from "@/lib/date";
import type {
  AdminMaintenanceAction,
  AdminBadgeDeviceSetting,
  AdminDashboardData,
  AdminOrderSummary,
  AdminOrdersAction,
  AdminPageData,
  AdminProductRecord
} from "@/lib/types";

export type AdminView =
  | "home"
  | "agenda"
  | "stock"
  | "cobros"
  | "clientes"
  | "reportes";
type StatusFilter =
  | "pendientes"
  | "agendados"
  | "historial";
type StockFilter = "todos" | "activos" | "pausados";
type CustomerFilter = "todos" | "con-pedidos" | "con-fiado" | "recientes";
type ReportTab = "resumen" | "rentabilidad";
type ReportRangePreset = "today" | "week" | "month" | "last-month" | "custom";
type ReportSalesFilter = "todos" | "pedido-cliente" | "venta-directa" | "venta-personalizada";
type OrderModalState =
  | { type: "agendar"; order: AdminOrderSummary }
  | { type: "cancelar"; order: AdminOrderSummary }
  | { type: "abonar"; order: AdminOrderSummary }
  | null;
type ProductModalState =
  | { mode: "create" }
  | { mode: "edit"; product: AdminProductRecord }
  | null;
type StockDraft = {
  stock: string;
  precioVenta: string;
  tipoProducto: string;
  activo: "activo" | "pausado";
};
type CustomerCardData = {
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
};
type GroupedFiadoCustomer = {
  clienteId: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  totalPendiente: number;
  cantidadFiados: number;
  fiados: AdminOrderSummary[];
};
type WhatsAppFallbackState = {
  message: string;
  url?: string;
  reason: "invalid-phone" | "open-failed";
};
type ProfitabilityCostStatus = "ok" | "estimated" | "missing";

const PENDING_ORDERS_REFRESH_MS = 60000;

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "pendientes", label: "Pendientes" },
  { value: "agendados", label: "Agendados" },
  { value: "historial", label: "Historial" }
];

type AdminDashboardProps = {
  initialData: AdminPageData;
  initialView?: AdminView;
};

const ADMIN_VIEW_ROUTES: Record<AdminView, string> = {
  home: "/admin",
  agenda: "/admin/pedidos",
  stock: "/admin/stock",
  cobros: "/admin/ventas",
  clientes: "/admin/clientes",
  reportes: "/admin/reportes"
};

const notificationService = createNotificationService();
const PENDING_ORDERS_SECTION_ID = "agenda-pendientes";
const SCHEDULED_ORDERS_SECTION_ID = "agenda-agendados";

const ADMIN_VIEW_META: Record<
  AdminView,
  {
    title: string;
    description: string;
  }
> = {
  home: {
    title: "Centro de control",
    description:
      "Resumen rápido y accesos claros para revisar pedidos, stock, ventas y clientes sin perderte."
  },
  agenda: {
    title: "Pedidos",
    description:
      "Revisa pendientes, agenda entregas y vuelve al inicio cuando termines."
  },
  stock: {
    title: "Stock",
    description:
      "Ajusta catálogo, stock, precios e imágenes desde una vista propia y ordenada."
  },
  cobros: {
    title: "Ventas",
    description:
      "Cierra pedidos, revisa fiados y deja sólo las acciones relevantes del flujo real."
  },
  clientes: {
    title: "Clientes",
    description:
      "Consulta historial reciente y vuelve al panel principal con gesto del navegador o Inicio."
  },
  reportes: {
    title: "Reportes",
    description:
      "Mira sólo los números importantes desde una vista independiente y clara."
  }
};

export function AdminDashboard({
  initialData,
  initialView = "home"
}: AdminDashboardProps) {
  const router = useRouter();
  const refreshOrdersInFlightRef = useRef<Promise<void> | null>(null);
  const refreshRetryTimeoutRef = useRef<number | null>(null);
  const [data, setData] = useState<AdminDashboardData>(initialData.dashboard);
  const [products, setProducts] = useState<AdminProductRecord[]>(initialData.productos);
  const [view, setView] = useState<AdminView>(initialView);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [whatsAppFallback, setWhatsAppFallback] = useState<WhatsAppFallbackState | null>(null);
  const [busyOrderId, setBusyOrderId] = useState("");
  const [busyProductId, setBusyProductId] = useState("");
  const [busyMaintenanceAction, setBusyMaintenanceAction] = useState("");
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendientes");
  const [stockFilter, setStockFilter] = useState<StockFilter>("activos");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("todos");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderModalState, setOrderModalState] = useState<OrderModalState>(null);
  const [productModalState, setProductModalState] = useState<ProductModalState>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<string, StockDraft>>({});
  const [reportTab, setReportTab] = useState<ReportTab>("rentabilidad");
  const [reportRangePreset, setReportRangePreset] = useState<ReportRangePreset>("month");
  const [reportSalesFilter, setReportSalesFilter] = useState<ReportSalesFilter>("todos");
  const [reportFrom, setReportFrom] = useState(() => getCurrentMonthRange().from);
  const [reportTo, setReportTo] = useState(() => getCurrentMonthRange().to);
  const [todayDate, setTodayDate] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [badgeDeviceId] = useState(() => getOrCreateDeviceId());
  const [badgeDeviceSetting, setBadgeDeviceSetting] = useState<AdminBadgeDeviceSetting | null>(
    null
  );
  const [badgeCardLoading, setBadgeCardLoading] = useState(false);
  const [badgeActionLoading, setBadgeActionLoading] = useState(false);
  const [isInstalledPwa] = useState(() => isRunningAsInstalledPwa());
  const [badgeSupported] = useState(() => isAppBadgeSupported());
  const [pushSupported] = useState(() => isPushNotificationsSupported());
  const [pushSubscriptionActive, setPushSubscriptionActive] = useState(false);

  const allOrders = useMemo(
    () => [
      ...data.pendientes,
      ...data.agendados,
      ...data.fiadosPendientes,
      ...data.finalizados,
      ...data.cancelados
    ],
    [data]
  );

  const normalizedSearch = search.trim().toLowerCase();
  const normalizedProductSearch = productSearch.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const stockMatches =
        stockFilter === "todos"
          ? true
          : stockFilter === "activos"
            ? product.activo
            : !product.activo;

      if (!stockMatches) {
        return false;
      }

      if (!normalizedProductSearch) {
        return true;
      }

      return [
        product.nombre,
        product.descripcion,
        product.tipoProducto,
        product.activo ? "activo" : "inactivo"
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedProductSearch);
    });
  }, [normalizedProductSearch, products, stockFilter]);

  const stockProductNameOptions = useMemo(
    () => Array.from(new Set(products.map((product) => product.nombre.trim()).filter(Boolean))).sort(),
    [products]
  );

  const stockTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(["simple", ...products.map((product) => (product.tipoProducto || "simple").trim())].filter(Boolean))
      ).sort(),
    [products]
  );

  const stockBadgeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => (product.badgeLabel || product.tipoProducto || "").trim())
            .filter(Boolean)
        )
      ).sort(),
    [products]
  );

  const stockPriceSuggestions = useMemo(
    () =>
      Array.from(new Set(products.map((product) => product.precioVenta).filter((price) => price > 0))).sort(
        (a, b) => a - b
      ),
    [products]
  );

  const ordersByFilter = useMemo(() => {
    function matches(order: AdminOrderSummary) {
      if (!normalizedSearch) {
        return true;
      }

      return [
        order.clienteNombre,
        order.clienteTelefono,
        order.clienteLugarTrabajo,
        order.productoNombre,
        order.estadoPedido,
        order.estadoPago,
        order.fechaEntrega ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    }

    return {
      pendientes: data.pendientes.filter(matches),
      agendados: data.agendados.filter(matches),
      finalizados: data.finalizados.filter(matches),
      cancelados: data.cancelados.filter(matches),
      fiadosPendientes: data.fiadosPendientes.filter(matches)
    };
  }, [data, normalizedSearch]);

  const agendaGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        customerKey: string;
        clienteId: string;
        clienteNombre: string;
        clienteTelefono: string;
        fechaEntrega: string;
        totalPedidos: number;
        totalItems: number;
        totalMonto: number;
        itemLines: Array<{ name: string; quantity: number }>;
        orders: AdminOrderSummary[];
      }
    >();

    data.agendados.forEach((order) => {
      const fechaEntrega = order.fechaEntrega ?? "sin-fecha";
      const customerKey = buildCustomerIdentityKey(order);
      const key = `${customerKey}__${fechaEntrega}`;
      const current = groups.get(key) ?? {
        key,
        customerKey,
        clienteId: order.clienteId,
        clienteNombre: order.clienteNombre,
        clienteTelefono: order.clienteTelefono,
        fechaEntrega,
        totalPedidos: 0,
        totalItems: 0,
        totalMonto: 0,
        itemLines: [],
        orders: []
      };

      current.totalPedidos += 1;
      current.totalItems += order.cantidad;
      current.totalMonto += order.total;
      current.itemLines = mergeOrderItems(
        current.itemLines ?? [],
        order.items.map((item) => ({
          name: item.productoNombre,
          quantity: item.cantidad
        }))
      );
      current.orders.push(order);
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.fechaEntrega === b.fechaEntrega) {
        return a.clienteNombre.localeCompare(b.clienteNombre);
      }

      return a.fechaEntrega.localeCompare(b.fechaEntrega);
    });
  }, [data.agendados]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setTodayDate(todayDateValue());
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    void getNotificationPermissionState().then(setNotificationPermission);
  }, []);

  useEffect(() => {
    if (!badgeDeviceId) {
      return;
    }

    let cancelled = false;

    async function loadBadgeSetting() {
      try {
        setBadgeCardLoading(true);
        const response = await fetch(
          `/api/admin/badge-settings?deviceId=${encodeURIComponent(badgeDeviceId)}`,
          { cache: "no-store" }
        );
        const currentData = (await response.json()) as {
          error?: string;
          setting?: AdminBadgeDeviceSetting | null;
        };

        if (!response.ok) {
          throw new Error(currentData.error ?? "No fue posible cargar el badge.");
        }

        if (!cancelled) {
          setBadgeDeviceSetting(currentData.setting ?? null);
        }
      } catch (currentError) {
        if (!cancelled) {
          setError(
            currentError instanceof Error
              ? currentError.message
              : "No fue posible cargar el badge."
          );
        }
      } finally {
        if (!cancelled) {
          setBadgeCardLoading(false);
        }
      }
    }

    void loadBadgeSetting();

    return () => {
      cancelled = true;
    };
  }, [badgeDeviceId]);

  useEffect(() => {
    if (!badgeDeviceId) {
      return;
    }

    let cancelled = false;

    async function loadPushSubscription() {
      try {
        const response = await fetch(
          `/api/admin/push-subscriptions?deviceId=${encodeURIComponent(badgeDeviceId)}`,
          { cache: "no-store" }
        );
        const currentData = (await response.json()) as {
          error?: string;
          subscription?: { isActive?: boolean } | null;
        };

        if (!response.ok) {
          throw new Error(currentData.error ?? "No fue posible cargar las notificaciones.");
        }

        if (!cancelled) {
          setPushSubscriptionActive(currentData.subscription?.isActive === true);
        }
      } catch {
        if (!cancelled) {
          setPushSubscriptionActive(false);
        }
      }
    }

    void loadPushSubscription();

    return () => {
      cancelled = true;
    };
  }, [badgeDeviceId]);

  useEffect(() => {
    let cancelled = false;
    let realtimeConnected = false;

    const refreshOrders = (reason: string) => {
      if (cancelled) {
        return Promise.resolve(undefined);
      }

      return refreshPendingBadgesSafe(reason);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshOrders("visible");
      }
    };

    const handleFocus = () => {
      void refreshOrders("focus");
    };

    const handleOnline = () => {
      void refreshOrders("online");
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void refreshOrders("poll");
    }, PENDING_ORDERS_REFRESH_MS);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refreshOrders("mount");

    let removeRealtimeSubscription: (() => void) | null = null;

    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`admin-pending-orders-${badgeDeviceId || "default"}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pedidos" },
          (payload) => {
            if (document.visibilityState !== "visible") {
              return;
            }

            const reason = payload.eventType === "INSERT" ? "realtime-insert" : "realtime-update";
            void refreshOrders(reason);
          }
        )
        .subscribe((status) => {
          realtimeConnected = status === "SUBSCRIBED";

          if (status === "SUBSCRIBED") {
            void refreshOrders("realtime-subscribed");
          }
        });

      const handleRealtimeReconnect = () => {
        if (!realtimeConnected && document.visibilityState === "visible") {
          void refreshOrders("realtime-reconnect");
        }
      };

      window.addEventListener("online", handleRealtimeReconnect);

      removeRealtimeSubscription = () => {
        window.removeEventListener("online", handleRealtimeReconnect);
        void supabase.removeChannel(channel);
      };
    } catch {
      removeRealtimeSubscription = null;
    }

    return () => {
      cancelled = true;
      clearRefreshRetryTimeout();
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      removeRealtimeSubscription?.();
    };
  }, [badgeDeviceId]);

  const homeSummary = useMemo(() => {
    const agendaHoy = todayDate
      ? data.agendados.filter((order) => order.fechaEntrega === todayDate)
      : [];
    const productosActivos = products.filter((product) => product.activo);
    const stockTotal = productosActivos.reduce(
      (sum, product) => sum + getUnifiedProductStock(product),
      0
    );
    const saldoPorCobrar = data.fiadosPendientes.reduce(
      (sum, order) => sum + order.saldoPendiente,
      0
    );

    return {
      pendientes: data.pendientes.length,
      agendaHoy: agendaHoy.length,
      productosActivos: productosActivos.length,
      stockTotal,
      saldoPorCobrar,
      ventasCerradas: data.finalizados.reduce((sum, order) => sum + order.totalPagado, 0)
    };
  }, [data, products, todayDate]);

  const pendingAttentionCount = useMemo(
    () => getNewAdminOrdersCount(data.pendientes),
    [data.pendientes]
  );

  const attentionCount = pendingAttentionCount;

  const pendingUnseenOrders = useMemo(
    () =>
      getNewAdminOrders(data.pendientes)
        .sort((a, b) => b.fechaPedido.localeCompare(a.fechaPedido))
        .slice(0, 4),
    [data.pendientes]
  );

  useEffect(() => {
    if (!badgeDeviceSetting?.badgeEnabled) {
      return;
    }

    async function syncBadge() {
      await updateAppBadge(attentionCount);

      if (!badgeDeviceId) {
        return;
      }

      const lastSyncAt = new Date().toISOString();

      setBadgeDeviceSetting((current) =>
        current
          ? {
              ...current,
              lastBadgeCount: attentionCount,
              lastSyncAt
            }
          : current
      );

      void fetch("/api/admin/badge-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          deviceId: badgeDeviceId,
          deviceLabel: getCurrentDeviceLabel(),
          badgeEnabled: true,
          badgeSupported,
          notificationPermission,
          runningAsPwa: isInstalledPwa,
          lastBadgeCount: attentionCount,
          lastSyncAt
        })
      });
    }

    void syncBadge();
  }, [
    attentionCount,
    badgeDeviceId,
    badgeDeviceSetting?.badgeEnabled,
    badgeSupported,
    isInstalledPwa,
    notificationPermission
  ]);

  const customerCards = useMemo(() => {
    const grouped = new Map<string, CustomerCardData>();

    allOrders.forEach((order) => {
      const customerKey = buildCustomerIdentityKey(order);
      const current = grouped.get(customerKey) ?? {
        clienteId: order.clienteId,
        nombre: order.clienteNombre,
        telefono: order.clienteTelefono,
        lugarTrabajo: order.clienteLugarTrabajo,
        pedidos: 0,
        pendiente: 0,
        totalComprado: 0,
        ultimoMovimiento: order.fechaPedido,
        proximasFechas: [],
        pedidosActivos: 0,
        pedidosFinalizados: 0,
        isRecent: false
      };

      current.pedidos += 1;
      current.pendiente += order.saldoPendiente;
      current.totalComprado += order.total;
      current.pedidosActivos +=
        order.estadoPedido === "PENDIENTE" || order.estadoPedido === "AGENDADO" ? 1 : 0;
      current.pedidosFinalizados += order.estadoPedido === "FINALIZADO" ? 1 : 0;
      current.ultimoMovimiento =
        current.ultimoMovimiento > order.fechaPedido
          ? current.ultimoMovimiento
          : order.fechaPedido;

      if (order.fechaEntrega && !current.proximasFechas.includes(order.fechaEntrega)) {
        current.proximasFechas.push(order.fechaEntrega);
      }

      grouped.set(customerKey, current);
    });

    return Array.from(grouped.values())
      .map((customer) => ({
        ...customer,
        proximasFechas: [...customer.proximasFechas].sort((a, b) => a.localeCompare(b)),
        isRecent: isRecentCustomerMovement(customer.ultimoMovimiento)
      }))
      .sort((a, b) => b.ultimoMovimiento.localeCompare(a.ultimoMovimiento));
  }, [allOrders]);

  const groupedFiados = useMemo(
    () => agruparFiadosPorCliente(data.fiadosPendientes),
    [data.fiadosPendientes]
  );

  const filteredCustomerCards = useMemo(() => {
    return customerCards.filter((customer) => {
      const matchesSearch =
        !normalizedSearch ||
        [customer.nombre, customer.telefono, customer.lugarTrabajo]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      if (!matchesSearch) {
        return false;
      }

      if (customerFilter === "con-pedidos") {
        return customer.pedidosActivos > 0 || customer.pedidosFinalizados > 0;
      }

      if (customerFilter === "con-fiado") {
        return customer.pendiente > 0;
      }

      if (customerFilter === "recientes") {
        return customer.isRecent;
      }

      return true;
    });
  }, [customerCards, customerFilter, normalizedSearch]);

  const customerSummary = useMemo(
    () => ({
      total: customerCards.length,
      conPedidos: customerCards.filter((customer) => customer.pedidos > 0).length,
      conFiado: customerCards.filter((customer) => customer.pendiente > 0).length,
      recientes: customerCards.filter((customer) => customer.isRecent).length
    }),
    [customerCards]
  );

  const reportOrders = useMemo(() => {
    return data.finalizados.filter((order) => {
      const baseDate = order.fechaCierre ?? order.fechaEntrega ?? order.fechaPedido;
      const dateOnly = baseDate.slice(0, 10);

      if (reportFrom && dateOnly < reportFrom) {
        return false;
      }

      if (reportTo && dateOnly > reportTo) {
        return false;
      }

      if (reportSalesFilter === "pedido-cliente" && order.origenPedido !== "PUBLICO") {
        return false;
      }

      if (reportSalesFilter === "venta-directa" && order.origenPedido !== "ADMIN_DIRECTO") {
        return false;
      }

      if (
        reportSalesFilter === "venta-personalizada" &&
        order.origenPedido !== "PERSONALIZADO"
      ) {
        return false;
      }

      return true;
    });
  }, [data.finalizados, reportFrom, reportSalesFilter, reportTo]);

  const reportSummary = useMemo(() => {
    const totalVentas = reportOrders.reduce((sum, order) => sum + order.total, 0);

    const ventasPorProducto = new Map<string, { nombre: string; unidades: number; total: number }>();
    const ventasPorCliente = new Map<string, { nombre: string; pedidos: number; total: number }>();

    reportOrders.forEach((order) => {
      const customerKey = buildCustomerIdentityKey(order);
      const customer = ventasPorCliente.get(customerKey) ?? {
        nombre: order.clienteNombre,
        pedidos: 0,
        total: 0
      };
      customer.pedidos += 1;
      customer.total += order.total;
      ventasPorCliente.set(customerKey, customer);

      order.items.forEach((item) => {
        const product = ventasPorProducto.get(item.productoId) ?? {
          nombre: item.productoNombre,
          unidades: 0,
          total: 0
        };
        product.unidades += item.cantidad;
        product.total += item.subtotal;
        ventasPorProducto.set(item.productoId, product);
      });
    });

    return {
      totalVentas,
      totalPedidos: reportOrders.length,
      topProductos: Array.from(ventasPorProducto.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
      topClientes: Array.from(ventasPorCliente.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    };
  }, [reportOrders]);

  const profitabilitySummary = useMemo(() => {
    const byProduct = new Map<
      string,
      {
        id: string;
        nombre: string;
        unidades: number;
        ventaTotal: number;
        costoTotal: number;
        utilidad: number;
        calculable: boolean;
        status: ProfitabilityCostStatus;
      }
    >();
    const byOrigin = new Map<
      string,
      {
        key: ReportSalesFilter;
        label: string;
        pedidos: number;
        unidades: number;
        ventaTotal: number;
        costoTotal: number;
        utilidad: number;
        calculableVenta: number;
        calculable: boolean;
      }
    >();
    const missingCostProducts = new Map<
      string,
      { id: string; nombre: string; unidades: number; ventaTotal: number }
    >();

    let totalVentas = 0;
    let totalCostos = 0;
    let totalUtilidad = 0;
    let totalUnidades = 0;
    let calculableVentas = 0;

    reportOrders.forEach((order) => {
      const originKey = mapOrderOriginToReportFilter(order.origenPedido);
      const originLabel = getSalesFilterLabel(originKey);
      const origin =
        byOrigin.get(originKey) ?? {
          key: originKey,
          label: originLabel,
          pedidos: 0,
          unidades: 0,
          ventaTotal: 0,
          costoTotal: 0,
          utilidad: 0,
          calculableVenta: 0,
          calculable: true
        };

      origin.pedidos += 1;

      order.items.forEach((item, index) => {
        const status = getOrderItemProfitabilityStatus(order, item);
        const productKey = item.productoId || `${order.id}-${index}-${item.productoNombre}`;
        const product =
          byProduct.get(productKey) ?? {
            id: item.productoId || "",
            nombre: item.productoNombre,
            unidades: 0,
            ventaTotal: 0,
            costoTotal: 0,
            utilidad: 0,
            calculable: true,
            status
          };

        totalVentas += item.subtotal;
        totalUnidades += item.cantidad;
        origin.unidades += item.cantidad;
        origin.ventaTotal += item.subtotal;
        product.unidades += item.cantidad;
        product.ventaTotal += item.subtotal;

        if (status === "missing") {
          product.calculable = false;
          product.status = "missing";
          origin.calculable = false;

          const missingProduct =
            missingCostProducts.get(productKey) ?? {
              id: item.productoId || "",
              nombre: item.productoNombre,
              unidades: 0,
              ventaTotal: 0
            };
          missingProduct.unidades += item.cantidad;
          missingProduct.ventaTotal += item.subtotal;
          missingCostProducts.set(productKey, missingProduct);
        } else {
          const lineCost =
            item.costoTotal ?? (item.costoUnitario ?? 0) * item.cantidad;
          const lineProfit =
            item.utilidadBruta ?? item.subtotal - lineCost;

          totalCostos += lineCost;
          totalUtilidad += lineProfit;
          calculableVentas += item.subtotal;
          origin.costoTotal += lineCost;
          origin.utilidad += lineProfit;
          origin.calculableVenta += item.subtotal;
          product.costoTotal += lineCost;
          product.utilidad += lineProfit;

          if (status === "estimated" && product.status !== "missing") {
            product.status = "estimated";
          }
        }

        byProduct.set(productKey, product);
      });

      byOrigin.set(originKey, origin);
    });

    return {
      totalVentas,
      totalCostos,
      totalUtilidad,
      totalUnidades,
      calculableVentas,
      margenPromedio:
        calculableVentas > 0 ? (totalUtilidad / calculableVentas) * 100 : 0,
      totalPedidos: reportOrders.length,
      productosSinCosto: Array.from(missingCostProducts.values()).sort(
        (a, b) => b.ventaTotal - a.ventaTotal
      ),
      resumenPorTipo: Array.from(byOrigin.values())
        .map((item) => ({
          ...item,
          margen: item.calculableVenta > 0 ? (item.utilidad / item.calculableVenta) * 100 : 0
        }))
        .sort((a, b) => b.ventaTotal - a.ventaTotal),
      rentabilidadPorProducto: Array.from(byProduct.values())
        .map((item) => ({
          ...item,
          margen: item.calculable && item.ventaTotal > 0 ? (item.utilidad / item.ventaTotal) * 100 : null
        }))
        .sort((a, b) => b.ventaTotal - a.ventaTotal),
      topProductosPorUtilidad: Array.from(byProduct.values())
        .filter((item) => item.calculable)
        .sort((a, b) => b.utilidad - a.utilidad)
        .slice(0, 5),
      topProductosPorVentas: Array.from(byProduct.values())
        .sort((a, b) => b.ventaTotal - a.ventaTotal)
        .slice(0, 5)
    };
  }, [reportOrders]);

  const agendaSections = useMemo(
    () => [
      {
        key: "pendientes",
        title: "Pendientes",
        subtitle: "Pedidos nuevos por revisar.",
        orders: ordersByFilter.pendientes,
        visible: statusFilter === "pendientes",
        emptyText: "No hay pedidos pendientes.",
        actions: [
          { key: "visto" as const, label: "Marcar visto", tone: "muted" as const },
          { key: "agendar" as const, label: "Agendar fecha", tone: "primary" as const },
          { key: "cancelar" as const, label: "Cancelar", tone: "muted" as const }
        ]
      },
      {
        key: "agendados",
        title: "Agendados",
        subtitle: "Pedidos ya coordinados.",
        orders: ordersByFilter.agendados,
        visible: statusFilter === "agendados",
        emptyText: "No hay pedidos agendados.",
        actions: [
          { key: "pagado" as const, label: "Pagado", tone: "primary" as const },
          { key: "fiado" as const, label: "Fiado", tone: "warning" as const },
          { key: "cancelar" as const, label: "Cancelar", tone: "muted" as const }
        ]
      },
    ],
    [ordersByFilter, statusFilter]
  );

  function applyReportRangePreset(nextPreset: ReportRangePreset) {
    setReportRangePreset(nextPreset);

    if (nextPreset === "custom") {
      return;
    }

    const range = getReportRangePresetValues(nextPreset);
    setReportFrom(range.from);
    setReportTo(range.to);
  }

  function handleReportFromChange(value: string) {
    setReportRangePreset("custom");
    setReportFrom(value);
  }

  function handleReportToChange(value: string) {
    setReportRangePreset("custom");
    setReportTo(value);
  }

  function openProductCostEditor(productName: string) {
    setProductSearch(productName);
    navigateToView("stock");
  }

  const agendaDetailOrders =
    statusFilter === "pendientes"
      ? ordersByFilter.pendientes
      : statusFilter === "agendados"
        ? ordersByFilter.agendados
        : [];
  const activeSelectedOrderId = agendaDetailOrders.some((order) => order.id === selectedOrderId)
    ? selectedOrderId
    : (agendaDetailOrders[0]?.id ?? "");
  const selectedOrder =
    agendaDetailOrders.find((order) => order.id === activeSelectedOrderId) ??
    agendaDetailOrders[0] ??
    null;

  function clearRefreshRetryTimeout() {
    if (refreshRetryTimeoutRef.current !== null) {
      window.clearTimeout(refreshRetryTimeoutRef.current);
      refreshRetryTimeoutRef.current = null;
    }
  }

  async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, ms = 10000) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), ms);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function loadOrders(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    try {
      if (!silent) {
        setLoading(true);
      }

      const response = await fetchWithTimeout("/api/admin/orders", { cache: "no-store" });
      const currentData = (await response.json()) as AdminDashboardData & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cargar pedidos.");
      }

      setData(currentData);
    } catch (currentError) {
      setError(
        currentError instanceof DOMException && currentError.name === "AbortError"
          ? "La sincronizacion de pedidos tardo demasiado. Vuelve a intentar."
          : currentError instanceof Error
          ? currentError.message
          : "No fue posible cargar pedidos."
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function loadProducts() {
    try {
      setCatalogLoading(true);
      const response = await fetch("/api/admin/products", { cache: "no-store" });
      const currentData = (await response.json()) as {
        products?: AdminProductRecord[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cargar productos.");
      }

      setProducts(currentData.products ?? []);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cargar productos."
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  async function refreshAll() {
    setError("");
    await Promise.all([loadOrders(), loadProducts()]);
  }

  const refreshPendingBadgesSafe = useEffectEvent(async (reason: string) => {
    if (refreshOrdersInFlightRef.current) {
      return refreshOrdersInFlightRef.current;
    }

    clearRefreshRetryTimeout();

    const refreshPromise = loadOrders({ silent: true })
      .catch(() => {
        if (reason === "poll") {
          return;
        }

        refreshRetryTimeoutRef.current = window.setTimeout(() => {
          refreshRetryTimeoutRef.current = null;
          void refreshPendingBadgesSafe("retry");
        }, 4000);
      })
      .finally(() => {
        refreshOrdersInFlightRef.current = null;
      });

    refreshOrdersInFlightRef.current = refreshPromise;
    return refreshPromise;
  });

  async function enableHomeScreenBadge() {
    await activateBadgeForCurrentDevice();
  }

  async function activateBadgeForCurrentDevice() {
    try {
      setBadgeActionLoading(true);
      setError("");
      setSuccessMessage("");

      const result = await requestBadgePermissionForCurrentDevice();
      setNotificationPermission(result.notificationPermission);

      const response = await fetch("/api/admin/badge-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          deviceId: badgeDeviceId,
          deviceLabel: getCurrentDeviceLabel(),
          badgeEnabled: result.enabled,
          badgeSupported: result.badgeSupported,
          notificationPermission: result.notificationPermission,
          runningAsPwa: result.runningAsPwa,
          lastBadgeCount: result.enabled ? attentionCount : 0,
          lastSyncAt: new Date().toISOString()
        })
      });
      const currentData = (await response.json()) as {
        error?: string;
        setting?: AdminBadgeDeviceSetting;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible guardar el badge.");
      }

      setBadgeDeviceSetting(currentData.setting ?? null);

      if (pushSupported) {
        const pushResult = await subscribeCurrentDeviceToPush();
        setNotificationPermission(pushResult.notificationPermission);

        if (pushResult.ok) {
          setPushSubscriptionActive(true);

          if (result.enabled) {
            await updateAppBadge(attentionCount);
            setSuccessMessage("Badge y notificaciones activados en este dispositivo.");
            return;
          }

          setSuccessMessage(
            "Las notificaciones push quedaron activas. El badge no esta disponible en este navegador."
          );
          return;
        }
      }

      if (result.enabled) {
        await updateAppBadge(attentionCount);
        setSuccessMessage("Badge activo en este dispositivo.");
        return;
      }

      setError(resolveBadgeActivationErrorMessage(result.error));
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No se pudo activar el badge. Revisa permisos del iPhone."
      );
    } finally {
      setBadgeActionLoading(false);
    }
  }

  async function testBadgeOnCurrentDevice() {
    try {
      setBadgeActionLoading(true);
      setError("");
      setSuccessMessage("");

      if ("setAppBadge" in navigator) {
        await navigator.setAppBadge(1);
      }

      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      await updateAppBadge(attentionCount);
      setSuccessMessage("Badge probado y sincronizado con los pedidos pendientes.");
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible probar el badge en este dispositivo."
      );
    } finally {
      setBadgeActionLoading(false);
    }
  }

  async function testPushOnCurrentDevice() {
    try {
      setBadgeActionLoading(true);
      setError("");
      setSuccessMessage("");

      const message = await sendCurrentDevicePushTest();
      setSuccessMessage(message);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible probar las notificaciones push."
      );
    } finally {
      setBadgeActionLoading(false);
    }
  }

  async function runMaintenanceAction(action: AdminMaintenanceAction) {
    const confirmed = window.confirm(
      action === "close-month"
        ? "Esto archivará toda la operación actual y dejará pedidos, pagos, fiados y clientes en blanco. Productos y stock se conservan. ¿Continúo?"
        : "Esto borrara la data operativa de prueba para el lanzamiento. Productos y stock se conservan. Continúo?"
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyMaintenanceAction(action);
      setError("");
      setSuccessMessage("");

      const response = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });
      const currentData = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible ejecutar la operacion.");
      }

      setSelectedOrderId("");
      setOrderModalState(null);
      setSuccessMessage(
        currentData.message ??
          (action === "close-month"
            ? "Cierre mensual completado."
            : "Limpieza de datos de prueba completada.")
      );
      await refreshAll();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible ejecutar la operacion."
      );
    } finally {
      setBusyMaintenanceAction("");
    }
  }

  function handleOrderAgendaWhatsApp(
    order: AdminOrderSummary,
    deliveryDateValue?: string
  ) {
    const message = buildScheduledOrderMessage(order, deliveryDateValue);
    const openResult = openWhatsAppSafe(order.clienteTelefono, message);

    if (openResult.status === "invalid-phone") {
      setSuccessMessage(
        openResult.error === "Sin telefono"
          ? "Pedido agendado, pero el cliente no tiene telefono valido para WhatsApp."
          : "Pedido agendado, pero el telefono del cliente no es valido para WhatsApp."
      );
      setWhatsAppFallback({
        message,
        reason: "invalid-phone"
      });
      return;
    }

    if (openResult.status === "blocked") {
      setSuccessMessage(
        "Pedido agendado. Si WhatsApp no se abrio, puedes copiar o reintentar el mensaje."
      );
      setWhatsAppFallback({
        message,
        url: openResult.url,
        reason: "open-failed"
      });
      return;
    }

    setWhatsAppFallback(null);
    setSuccessMessage("Pedido agendado correctamente.");
  }

  function returnToOrdersListAfterSchedule() {
    setOrderModalState(null);
    setSelectedOrderId("");
    setView("agenda");
    setStatusFilter("pendientes");
  }

  async function copyWhatsAppFallbackMessage() {
    if (!whatsAppFallback?.message) {
      return;
    }

    try {
      await navigator.clipboard.writeText(whatsAppFallback.message);
      setSuccessMessage("Mensaje copiado. Ya puedes pegarlo manualmente en WhatsApp.");
    } catch {
      setError(
        "No se pudo copiar el mensaje automaticamente. Copialo manualmente desde el recuadro."
      );
    }
  }

  function retryWhatsAppFallback() {
    if (!whatsAppFallback?.url) {
      return;
    }

    const opened = window.open(whatsAppFallback.url, "_blank", "noopener,noreferrer");

    if (!opened) {
      setSuccessMessage(
        "Pedido agendado, pero el navegador sigue bloqueando WhatsApp. Puedes copiar el mensaje manualmente."
      );
      return;
    }

    setWhatsAppFallback(null);
    setSuccessMessage("WhatsApp abierto con el mensaje del pedido agendado.");
  }

  async function runAction(
    pedidoId: string,
    action: AdminOrdersAction,
    order?: AdminOrderSummary,
    payload?: {
      fechaEntrega?: string;
      motivoCancelacion?: string;
      monto?: number;
      metodoPago?: string;
    }
    ) {
    let scheduledOrderData: { order: AdminOrderSummary; deliveryDateValue?: string } | null = null;

    try {
      setBusyOrderId(pedidoId);
      setError("");
      setSuccessMessage("");
      setWhatsAppFallback(null);
      const response = await fetch(`/api/admin/orders/${pedidoId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          ...payload
        })
      });

      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible actualizar el pedido.");
      }

      setOrderModalState(null);
      await loadOrders();

      if (action === "agendar" && order) {
        returnToOrdersListAfterSchedule();
        scheduledOrderData = {
          order,
          deliveryDateValue: payload?.fechaEntrega
        };
      }
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible actualizar el pedido."
      );
      return;
    } finally {
      setBusyOrderId("");
    }

    if (scheduledOrderData) {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          handleOrderAgendaWhatsApp(
            scheduledOrderData.order,
            scheduledOrderData.deliveryDateValue
          );
        }, 0);
      });
    }
  }

  async function saveProduct(payload: {
    id?: string;
    nombre: string;
    descripcion: string;
    precioVenta: number;
    imageUrl?: string;
    badgeLabel?: string;
    costoUnitario: number;
    stock: number;
    tipoProducto: string;
    activo: boolean;
  }) {
    try {
      setBusyProductId(payload.id ?? "new");
      setError("");
      const url = payload.id
        ? `/api/admin/products/${payload.id}`
        : "/api/admin/products";
      const method = payload.id ? "PATCH" : "POST";
      const body = payload.id
        ? JSON.stringify({ mode: "update", ...payload })
        : JSON.stringify(payload);
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body
      });
      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible guardar el producto.");
      }

      setProductModalState(null);
      await loadProducts();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible guardar el producto."
      );
    } finally {
      setBusyProductId("");
    }
  }

  async function saveStock(product: AdminProductRecord) {
    const draft = stockDrafts[product.id];
    const normalizedStock = normalizeStockValue(
      draft?.stock ?? getUnifiedProductStock(product)
    );
    const nextActive =
      normalizedStock <= 0
        ? false
        : (draft?.activo ?? (product.activo ? "activo" : "pausado")) === "activo";

    await saveProduct({
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      precioVenta: Number(draft?.precioVenta ?? product.precioVenta),
      imageUrl: product.imageUrl,
      badgeLabel: product.badgeLabel,
      costoUnitario: product.costoUnitario,
      stock: normalizedStock,
      tipoProducto: draft?.tipoProducto ?? product.tipoProducto,
      activo: nextActive
    });
  }

  async function deleteProduct(product: AdminProductRecord) {
    const confirmed = window.confirm(
      `¿Eliminar "${product.nombre}" del catálogo? Si ya tiene pedidos asociados, el sistema no lo dejará borrar y tendrás que dejarlo pausado.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyProductId(product.id);
      setError("");
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE"
      });
      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible eliminar el producto.");
      }

      setProductModalState((current) =>
        current?.mode === "edit" && current.product.id === product.id ? null : current
      );
      await loadProducts();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible eliminar el producto."
      );
    } finally {
      setBusyProductId("");
    }
  }

  function updateStockDraft(
    productId: string,
    key: keyof StockDraft,
    value: string,
    product: AdminProductRecord
  ) {
    setStockDrafts((current) => ({
      ...current,
      [productId]: {
        stock: current[productId]?.stock ?? String(getUnifiedProductStock(product)),
        precioVenta: current[productId]?.precioVenta ?? String(product.precioVenta),
        tipoProducto: current[productId]?.tipoProducto ?? product.tipoProducto,
        activo: current[productId]?.activo ?? (product.activo ? "activo" : "pausado"),
        [key]: value
      }
    }));
  }

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/admin/login";
  }

  function navigateToView(nextView: AdminView) {
    setView(nextView);
    router.push(ADMIN_VIEW_ROUTES[nextView]);
  }

  function openAttentionOrders() {
    const nextFilter = pendingAttentionCount > 0 ? "pendientes" : "agendados";
    const targetId =
      nextFilter === "pendientes" ? PENDING_ORDERS_SECTION_ID : SCHEDULED_ORDERS_SECTION_ID;

    setStatusFilter(nextFilter);
    setView("agenda");
    router.push(`/admin/pedidos#${targetId}`);

    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openCustomerOrders(customer: CustomerCardData) {
    setSearch(customer.nombre);
    setStatusFilter("historial");
    navigateToView("agenda");
  }

  function openCustomerPayments(customer: CustomerCardData) {
    setSearch(customer.nombre);
    navigateToView("cobros");
  }

  useEffect(() => {
    if (view !== "agenda") {
      return;
    }

    const hash = window.location.hash.replace("#", "");

    if (hash !== PENDING_ORDERS_SECTION_ID && hash !== SCHEDULED_ORDERS_SECTION_ID) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(hash);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [statusFilter, view]);

  const currentViewMeta = ADMIN_VIEW_META[view];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-5 overflow-x-hidden px-4 py-5 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6">
      <AdminNotificationBadge count={attentionCount} onClick={openAttentionOrders} />

      <section className="max-w-full overflow-x-hidden rounded-[28px] border border-emerald-100 bg-[linear-gradient(135deg,#f8fdf9_0%,#edf8f0_100%)] p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
              <Store className="h-4 w-4" />
              Panel admin
            </span>
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 rounded-[20px] bg-[#f3faf4] p-2 shadow-[0_12px_24px_rgba(31,51,40,0.08)]">
                <Image
                  src="/brand/pauli-store-logo-transparent.png"
                  alt="Logo Pauli Store"
                  fill
                  className="object-contain p-2"
                  priority
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                  Pauli Store
                </div>
                <h1 className="font-display text-3xl font-semibold text-emerald-950">
                  {currentViewMeta.title}
                </h1>
              </div>
            </div>
            <div className="space-y-1">
              <p className="max-w-3xl text-sm leading-6 text-emerald-900/70">
                {currentViewMeta.description}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/80">
                Pauli Store admin
              </p>
              {isInstalledPwa &&
              attentionCount > 0 &&
              !badgeDeviceSetting?.badgeEnabled ? (
                <button
                  type="button"
                  onClick={() => void enableHomeScreenBadge()}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#F0D69B] bg-[#FFF8DE] px-4 py-2 text-sm font-semibold text-[#7A5A10] shadow-[0_10px_22px_rgba(122,90,16,0.12)]"
                >
                  Activar badge en icono
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {view !== "home" ? (
              <HeaderIconButton
                label="Ir al inicio"
                title="Ir al inicio"
                onClick={() => navigateToView("home")}
                icon={<Home className="h-5 w-5" />}
              />
            ) : null}
            <BadgeStatusChip
              badgeEnabled={badgeDeviceSetting?.badgeEnabled === true}
              badgeSupported={badgeSupported}
              notificationPermission={notificationPermission}
              isInstalledPwa={isInstalledPwa}
              onClick={
                badgeDeviceSetting?.badgeEnabled
                  ? undefined
                  : () => void enableHomeScreenBadge()
              }
              pendingCount={attentionCount}
            />
            {badgeDeviceSetting?.badgeEnabled ? (
              <HeaderIconButton
                label="Probar badge"
                title="Probar badge"
                onClick={() => void testBadgeOnCurrentDevice()}
                disabled={badgeActionLoading}
                icon={<BellRing className="h-5 w-5" />}
              />
            ) : null}
            <HeaderIconButton
              label="Actualizar"
              title="Actualizar"
              onClick={() => void refreshAll()}
              icon={<RefreshCcw className="h-5 w-5" />}
              accent="soft"
            />
            <HeaderIconButton
              label="Cerrar sesion"
              title="Cerrar sesion"
              onClick={logout}
              icon={<KeyRound className="h-5 w-5" />}
            />
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-20 max-w-full overflow-x-hidden rounded-lg border border-emerald-100 bg-white/95 p-3 shadow-soft backdrop-blur">
        <StableHorizontalRail className="flex gap-2 overflow-x-auto pb-1">
          <AdminSectionTab
            label="Inicio"
            icon={Home}
            active={view === "home"}
            badge="Resumen"
            onClick={() => navigateToView("home")}
          />
          <AdminSectionTab
            label="Pedidos"
            icon={ClipboardList}
            active={view === "agenda"}
            badge={`${attentionCount} por atender`}
            onClick={() => navigateToView("agenda")}
          />
          <AdminSectionTab
            label="Stock"
            icon={Boxes}
            active={view === "stock"}
            badge={`${products.filter((product) => product.activo).length} activos`}
            onClick={() => navigateToView("stock")}
          />
          <AdminSectionTab
            label="Ventas"
            icon={WalletCards}
            active={view === "cobros"}
            badge={`${groupedFiados.length} fiados`}
            onClick={() => navigateToView("cobros")}
          />
          <AdminSectionTab
            label="Clientes"
            icon={UserRound}
            active={view === "clientes"}
            badge={`${customerCards.length} registros`}
            onClick={() => navigateToView("clientes")}
          />
          <AdminSectionTab
            label="Reportes"
            icon={CalendarRange}
            active={view === "reportes"}
            badge={formatCurrency(reportSummary.totalVentas)}
            onClick={() => navigateToView("reportes")}
          />
          <Link
            href="/admin/venta-directa"
            className="min-h-[88px] min-w-[132px] rounded-[20px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-left text-emerald-900 transition hover:border-emerald-200 sm:min-w-[146px]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-[16px] bg-white p-2 text-emerald-700">
                <ShoppingBag className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 min-w-0">
              <div className="text-sm font-semibold text-emerald-950">Venta directa</div>
              <div className="mt-1 text-xs text-emerald-700/80">Personalizada</div>
            </div>
          </Link>
        </StableHorizontalRail>
      </section>

      {error ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {whatsAppFallback ? (
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <div className="font-semibold">
            Pedido agendado, pero WhatsApp no se pudo abrir automaticamente.
          </div>
          <p className="mt-2 text-amber-900/85">
            Puedes copiar el mensaje y enviarlo manualmente. Si el navegador lo permite,
            tambien puedes reintentar abrir WhatsApp.
          </p>
          <textarea
            readOnly
            value={whatsAppFallback.message}
            className="mt-3 min-h-32 w-full rounded-2xl border border-amber-200 bg-white px-3 py-3 text-sm text-emerald-950"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void copyWhatsAppFallbackMessage()}
              className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-amber-500 px-4 py-3 text-sm font-semibold text-white"
            >
              Copiar mensaje
            </button>
            {whatsAppFallback.url ? (
              <button
                type="button"
                onClick={retryWhatsAppFallback}
                className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-950"
              >
                Reintentar WhatsApp
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setWhatsAppFallback(null)}
              className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-950"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {view === "home" ? (
        <section className="min-w-0 max-w-full overflow-x-hidden space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <HeroMetric
              label="Pedidos por atender"
              value={String(attentionCount)}
              detail="Sin agendar o aun no revisados"
              icon={Clock3}
              tone="rose"
            />
            <HeroMetric
              label="Agenda de hoy"
              value={String(homeSummary.agendaHoy)}
              detail="Pedidos a coordinar o entregar hoy"
              icon={CalendarClock}
              tone="violet"
            />
            <HeroMetric
              label="Por cobrar"
              value={formatCurrency(homeSummary.saldoPorCobrar)}
              detail="Saldo pendiente de fiados"
              icon={HandCoins}
              tone="amber"
            />
            <HeroMetric
              label="Ventas cerradas"
              value={formatCurrency(homeSummary.ventasCerradas)}
              detail="Pagos y cierres acumulados"
              icon={CircleDollarSign}
              tone="emerald"
            />
          </div>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-emerald-950">Lo de hoy</h2>
                  <p className="text-sm text-emerald-900/65">
                    Tres decisiones y listo.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <QuickTaskRow
                  title="Revisar pendientes"
                  detail={`${attentionCount} pedido(s) por atender`}
                  icon={Clock3}
                  onClick={openAttentionOrders}
                />
                <QuickTaskRow
                  title="Cerrar ventas"
                  detail={`${data.agendados.length} pedido(s) listos para cobrar`}
                  icon={WalletCards}
                  onClick={() => navigateToView("cobros")}
                />
                <QuickTaskRow
                  title="Ajustar stock"
                  detail={`${products.filter((product) => getUnifiedProductStock(product) <= 0).length} producto(s) sin stock`}
                  icon={Boxes}
                  onClick={() => {
                    navigateToView("stock");
                    setStockFilter("pausados");
                  }}
                />
              </div>
            </article>

            <article className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-emerald-950">Cierre rápido</h2>
                  <p className="text-sm text-emerald-900/65">
                    Números puntuales del negocio.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <SimpleFact label="Ventas del rango" value={formatCurrency(reportSummary.totalVentas)} />
                <SimpleFact
                  label="Productos sin stock"
                  value={String(products.filter((product) => getUnifiedProductStock(product) <= 0).length)}
                />
              </div>
            </article>
          </section>

          {!badgeDeviceSetting?.badgeEnabled ? (
          <section className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-emerald-950">Badge del icono</h2>
                <p className="mt-1 text-sm text-emerald-900/65">
                  Activa el contador de pedidos pendientes en el icono de la app de tu iPhone.
                </p>
              </div>
              {badgeDeviceSetting?.badgeEnabled ? (
                <StatusBadge tone="pedido" label="ACTIVO" />
              ) : (
                <StatusBadge tone="neutral" label="POR ACTIVAR" />
              )}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SimpleFact
                label="Soporte"
                value={badgeSupported ? "Disponible" : "No compatible"}
              />
              <SimpleFact
                label="Modo app"
                value={isInstalledPwa ? "Desde icono" : "Abrir desde inicio"}
              />
              <SimpleFact
                label="Permiso"
                value={formatBadgePermission(notificationPermission)}
              />
              <SimpleFact
                label="Contador actual"
                value={String(attentionCount)}
              />
              <SimpleFact
                label="Push"
                value={
                  !pushSupported
                    ? "No compatible"
                    : pushSubscriptionActive
                      ? "Activo"
                      : "Pendiente"
                }
              />
            </div>

            <div className="mt-4 space-y-2 text-sm text-emerald-900/75">
              {!badgeSupported ? (
                <p>Este navegador no soporta badge en el icono.</p>
              ) : null}
              {!isInstalledPwa ? (
                <p>
                  Para ver el badge en el icono, instala Pauli Store en la pantalla de
                  inicio y abre la app desde ese icono.
                </p>
              ) : null}
              {!pushSupported ? (
                <p>Este navegador no soporta notificaciones push web para esta app.</p>
              ) : null}
              {notificationPermission === "denied" ? (
                <p>
                  El permiso fue denegado. Debes activarlo desde Ajustes del iPhone para
                  esta app.
                </p>
              ) : null}
              {badgeDeviceSetting?.badgeEnabled ? (
                <p>Badge activo en este dispositivo.</p>
              ) : (
                <p>Activa el badge desde este dispositivo para sincronizarlo con los pedidos.</p>
              )}
              {pushSubscriptionActive ? (
                <p>Las notificaciones push estan activas para este dispositivo.</p>
              ) : null}
              {badgeDeviceSetting?.lastSyncAt ? (
                <p>
                  Ultima sincronizacion: {formatShortDateTime(badgeDeviceSetting.lastSyncAt)}.
                </p>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={badgeActionLoading || badgeCardLoading || !badgeDeviceId}
                onClick={() => void activateBadgeForCurrentDevice()}
                className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-200"
              >
                {badgeActionLoading ? "Activando..." : "Activar badge en este iPhone"}
              </button>
              {badgeDeviceSetting?.badgeEnabled ? (
                <button
                  type="button"
                  disabled={badgeActionLoading}
                  onClick={() => void testBadgeOnCurrentDevice()}
                  className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-50"
                >
                  Probar badge
                </button>
              ) : null}
              {pushSupported && pushSubscriptionActive ? (
                <button
                  type="button"
                  disabled={badgeActionLoading}
                  onClick={() => void testPushOnCurrentDevice()}
                  className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:bg-emerald-50"
                >
                  Probar notificación
                </button>
              ) : null}
            </div>
          </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft lg:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-emerald-950">Pedidos por atender</h2>
                  <p className="mt-1 text-sm text-emerald-900/65">
                    Lo ultimo que entro y aun sigue sin agenda o sin revision final. Desde aqui puedes revisar, abrir agenda o compartir el resumen por WhatsApp.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAttentionOrders}
                  className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
                >
                  Abrir pedidos
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {pendingUnseenOrders.length === 0 ? (
                  <EmptyState text="No hay pedidos por atender ahora mismo." />
                ) : null}
                {pendingUnseenOrders.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-emerald-950">
                            {order.clienteNombre}
                          </div>
                          <StatusBadge tone="warning" label="NUEVO" />
                          {order.fechaEntrega ? (
                            <StatusBadge
                              tone="neutral"
                              label={`Entrega ${formatDateOnly(order.fechaEntrega)}`}
                            />
                          ) : null}
                        </div>
                        <div className="text-sm text-emerald-900/70">
                          {order.clienteLugarTrabajo || "Sin lugar"} ·{" "}
                          {order.clienteTelefono || "Sin teléfono"}
                        </div>
                        <div className="space-y-1 text-sm text-emerald-900/80">
                          {renderGroupedItemLines(
                            order.items.map((item) => ({
                              name: item.productoNombre,
                              quantity: item.cantidad
                            })),
                            3
                          ).map((line) => (
                            <div key={`${order.id}-${line}`}>{line}</div>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-emerald-700/70">
                          Total
                        </div>
                        <div className="mt-1 text-lg font-bold text-emerald-950">
                          {formatCurrency(order.total)}
                        </div>
                        <div className="mt-1 text-xs text-emerald-900/65">
                          {formatShortDateTime(order.fechaPedido)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          openAttentionOrders();
                          setSelectedOrderId(order.id);
                        }}
                        className={`${buttonToneClass("primary")} w-full justify-center sm:w-auto`}
                      >
                        Ver detalle
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction(order.id, "visto", order)}
                        className={`${buttonToneClass("muted")} w-full justify-center sm:w-auto`}
                      >
                        Marcar visto
                      </button>
                      <NewOrderWhatsAppButton order={order} />
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <FocusCard
              title="Lo primero hoy"
              text="Revisa pedidos pendientes y asígnales fecha antes de todo."
              icon={AlertCircle}
              tone="rose"
            />
            <FocusCard
              title="Después cobra"
              text="Los pedidos agendados se cierran como pagados o fiados desde Ventas."
              icon={CheckCircle2}
              tone="violet"
            />
            <FocusCard
              title="Y al final repone"
              text="Ajusta stock y pausa productos cuando no vayas a venderlos."
              icon={Boxes}
              tone="amber"
            />
          </section>

          <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-emerald-950">Atajos principales</h2>
              <p className="text-sm text-emerald-900/70">
                Entra directo a lo que más usa Pauli en el día a día.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <HomeActionCard
                title="Agenda"
                subtitle="Revisar pendientes, agendar fechas y ver pedidos del día."
                badge={`${attentionCount} por atender`}
                icon={ClipboardList}
                tone="rose"
                onClick={openAttentionOrders}
              />
              <HomeActionCard
                title="Stock"
                subtitle="Crear productos, abrir o pausar catálogo y ajustar cupos."
                badge={`${homeSummary.productosActivos} activos`}
                icon={Boxes}
                tone="violet"
                onClick={() => navigateToView("stock")}
              />
              <HomeActionCard
                title="Ventas"
                subtitle="Marcar pagado, dejar fiado y registrar abonos fácilmente."
                badge={`${groupedFiados.length} fiados`}
                icon={WalletCards}
                tone="amber"
                onClick={() => navigateToView("cobros")}
              />
              <HomeActionCard
                title="Clientes"
                subtitle="Ver quiénes compran seguido y sus fechas más recientes."
                badge={`${customerCards.length} registros`}
                icon={UserRound}
                tone="emerald"
                onClick={() => navigateToView("clientes")}
              />
              <HomeActionCard
                title="Reportes"
                subtitle="Ventas por rango de fechas, top productos y top clientes."
                badge="Resumen rápido"
                icon={CalendarRange}
                tone="slate"
                onClick={() => navigateToView("reportes")}
              />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
              <div className="flex items-center gap-2 text-emerald-950">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-lg font-bold">Agenda agrupada</h3>
              </div>
              <p className="mt-1 text-sm text-emerald-900/70">
                Si una misma persona pidió varias veces para el mismo día, aquí aparece todo junto.
              </p>

              <div className="mt-4 space-y-3">
                {agendaGroups.length === 0 ? (
                  <EmptyState text="Todavía no hay pedidos agendados." />
                ) : null}
                {agendaGroups.slice(0, 4).map((group) => (
                  <article
                    key={group.key}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-emerald-950">{group.clienteNombre}</div>
                        <div className="mt-1 text-sm text-emerald-900/65">
                          {group.fechaEntrega === "sin-fecha"
                            ? "Sin fecha"
                            : formatDateOnly(group.fechaEntrega)}
                        </div>
                      </div>
                      <StatusBadge tone="neutral" label={`${group.totalPedidos} pedido(s)`} />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <MiniMetric label="Items" value={String(group.totalItems)} />
                      <MiniMetric label="Monto" value={formatCurrency(group.totalMonto)} />
                      <MiniMetric label="Teléfono" value={group.clienteTelefono || "-"} />
                    </div>
                    <div className="mt-3 space-y-2 rounded-2xl border border-emerald-100 bg-white/90 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
                        Pedido
                      </div>
                      {renderGroupedItemLines(group.itemLines, 4).map((line) => (
                        <div key={`${group.key}-${line}`} className="text-sm text-emerald-900/80">
                          {line}
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
              <div className="flex items-center gap-2 text-emerald-950">
                <Store className="h-5 w-5" />
                <h3 className="text-lg font-bold">Resumen al grano</h3>
              </div>
              <div className="mt-4 space-y-3">
                <SimpleFact
                  label="Productos activos"
                  value={`${homeSummary.productosActivos}`}
                />
                <SimpleFact
                  label="Stock total"
                  value={`${homeSummary.stockTotal}`}
                />
                <SimpleFact
                  label="Pedidos agendados"
                  value={`${data.agendados.length}`}
                />
                <SimpleFact
                  label="Pedidos cerrados"
                  value={`${data.finalizados.length}`}
                />
              </div>
            </section>
          </section>
        </section>
      ) : null}

      {view === "agenda" ? (
        <section className="space-y-5">
          <SectionIntro
            title="Agenda de pedidos"
            subtitle="Confirma pedidos, asigna fecha y revisa cada cliente sin perderte."
            icon={ClipboardList}
            helper="Paso 1: entra aquí varias veces al día. Lo pendiente arriba, el detalle al costado."
          />

          <div className="grid gap-4 rounded-lg border border-emerald-100 bg-white/90 p-4 shadow-soft lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <Search className="h-4 w-4" />
                Buscar pedido
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, teléfono, producto o fecha"
                className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 outline-none placeholder:text-emerald-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-emerald-900">Vista</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <MiniHomeTab
              title="Pendientes"
              value={String(ordersByFilter.pendientes.length)}
              active={statusFilter === "pendientes"}
              onClick={() => setStatusFilter("pendientes")}
              tone="rose"
            />
            <MiniHomeTab
              title="Agendados"
              value={String(ordersByFilter.agendados.length)}
              active={statusFilter === "agendados"}
              onClick={() => setStatusFilter("agendados")}
              tone="violet"
            />
            <MiniHomeTab
              title="Historial"
              value={String(ordersByFilter.finalizados.length + ordersByFilter.cancelados.length)}
              active={statusFilter === "historial"}
              onClick={() => setStatusFilter("historial")}
              tone="amber"
            />
          </div>

          <div
            className={`grid gap-5 ${
              statusFilter === "historial"
                ? "xl:grid-cols-1"
                : "xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]"
            }`}
          >
            <div className="space-y-5">
              {agendaSections
                .filter((section) => section.visible)
                .map((section) => (
                  <OrderSection
                    key={section.key}
                    htmlId={
                      section.key === "pendientes"
                        ? PENDING_ORDERS_SECTION_ID
                        : section.key === "agendados"
                          ? SCHEDULED_ORDERS_SECTION_ID
                          : undefined
                    }
                    title={section.title}
                    subtitle={section.subtitle}
                    orders={section.orders}
                    loading={loading}
                    emptyText={section.emptyText}
                    busyOrderId={busyOrderId}
                    selectedOrderId={activeSelectedOrderId}
                    actions={section.actions}
                    onSelect={setSelectedOrderId}
                    onAction={(order, action) => {
                      if (action === "agendar") {
                        setOrderModalState({ type: "agendar", order });
                        return;
                      }

                      if (action === "cancelar") {
                        setOrderModalState({ type: "cancelar", order });
                        return;
                      }

                      if (action === "abonar") {
                        setOrderModalState({ type: "abonar", order });
                        return;
                      }

                      void runAction(order.id, action, order);
                    }}
                  />
                ))}

              {statusFilter === "historial" ? (
                <div className="grid gap-5">
                  <CompactHistorySection
                    title="Pedidos cerrados"
                    subtitle="Ventas ya resueltas."
                    orders={ordersByFilter.finalizados}
                    emptyText="No hay pedidos cerrados."
                  />
                  <CompactHistorySection
                    title="Pedidos cancelados"
                    subtitle="Solo para trazabilidad, sin ocupar la vista principal."
                    orders={ordersByFilter.cancelados}
                    emptyText="No hay pedidos cancelados."
                  />
                </div>
              ) : null}
            </div>

            {statusFilter !== "historial" ? (
              <aside className="rounded-lg border border-emerald-200 bg-[linear-gradient(180deg,#f7fcf8_0%,#ffffff_100%)] p-5 shadow-soft xl:sticky xl:top-5 xl:h-fit">
                <div className="mb-4 rounded-2xl border border-emerald-100 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700/70">
                    Resumen del pedido seleccionado
                  </div>
                  <p className="mt-1 text-sm text-emerald-900/65">
                    Aqui se ve el detalle completo del pedido activo sin confundirse con la lista.
                  </p>
                </div>
                <OrderDetailPanel order={selectedOrder} agendaGroups={agendaGroups} />
              </aside>
            ) : null}
          </div>
        </section>
      ) : null}

      {view === "stock" ? (
        <section className="space-y-5">
          <SectionIntro
            title="Stock y productos"
            subtitle="Crea productos, cambia precio, activa o pausa ventas y define stock disponible."
            icon={Boxes}
            helper="Paso 2: deja aquí lo que sí vas a vender y el cupo máximo para no sobreagendar."
            action={
              <button
                type="button"
                onClick={() => setProductModalState({ mode: "create" })}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Nuevo producto
              </button>
            }
          />

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-emerald-100 bg-white/90 p-4 shadow-soft">
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="min-w-0 space-y-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Search className="h-4 w-4" />
                  Buscar producto
                </span>
                <input
                  list="stock-product-options"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Nombre, descripción o tipo"
                  className="block w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 outline-none placeholder:text-emerald-400"
                />
                <datalist id="stock-product-options">
                  {stockProductNameOptions.map((productName) => (
                    <option key={productName} value={productName} />
                  ))}
                  {stockTypeOptions.map((typeOption) => (
                    <option key={`type-${typeOption}`} value={typeOption} />
                  ))}
                </datalist>
              </label>

              <div className="min-w-0 space-y-2">
                <span className="text-sm font-semibold text-emerald-900">Filtro rápido</span>
                <StableHorizontalRail className="flex gap-2 overflow-x-auto">
                  <FilterChip
                    label="Activos"
                    active={stockFilter === "activos"}
                    onClick={() => setStockFilter("activos")}
                  />
                  <FilterChip
                    label="Pausados"
                    active={stockFilter === "pausados"}
                    onClick={() => setStockFilter("pausados")}
                  />
                  <FilterChip
                    label="Todos"
                    active={stockFilter === "todos"}
                    onClick={() => setStockFilter("todos")}
                  />
                </StableHorizontalRail>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <HeroMetric
              label="Catálogo activo"
              value={String(products.filter((product) => product.activo).length)}
              detail="Productos visibles para clientes"
              icon={CheckCircle2}
              tone="emerald"
            />
            <HeroMetric
              label="Pausados"
              value={String(products.filter((product) => !product.activo).length)}
              detail="Productos fuera del catálogo"
              icon={Package2}
              tone="violet"
            />
            <HeroMetric
              label="Sin stock"
              value={String(products.filter((product) => getUnifiedProductStock(product) <= 0).length)}
              detail="Revisar antes de abrir ventas"
              icon={AlertCircle}
              tone="amber"
            />
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {catalogLoading ? <EmptyState text="Cargando catálogo..." /> : null}
            {!catalogLoading && filteredProducts.length === 0 ? (
              <EmptyState text="No hay productos para esta busqueda." />
            ) : null}
            {filteredProducts.map((product) => {
              const draft = stockDrafts[product.id];

              return (
                <StockProductCard
                  key={product.id}
                  product={product}
                  draft={draft}
                  busy={busyProductId === product.id}
                  onEdit={() => setProductModalState({ mode: "edit", product })}
                  onDelete={() => void deleteProduct(product)}
                  onChange={(key, value) => updateStockDraft(product.id, key, value, product)}
                  onSave={() => void saveStock(product)}
                  typeOptions={stockTypeOptions}
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {view === "cobros" ? (
        <section className="space-y-5">
          <SectionIntro
            title="Ventas y pagos"
            subtitle="Desde aquí se ve clarito qué pedidos cobrar, cuáles dejar fiados y dónde registrar abonos."
            icon={WalletCards}
            helper="Paso 3: al entregar, marca pagado o fiado. Si te pagan después, registra el abono aquí."
          />

          <div className="grid gap-4 md:grid-cols-3">
            <HeroMetric
              label="Listos para cobrar"
              value={String(data.agendados.length)}
              detail="Pedidos agendados esperando cierre"
              icon={CheckCheck}
              tone="rose"
            />
            <HeroMetric
              label="Fiados abiertos"
              value={String(groupedFiados.length)}
              detail="Clientes con saldo pendiente"
              icon={HandCoins}
              tone="amber"
            />
            <HeroMetric
              label="Saldo por cobrar"
              value={formatCurrency(
                groupedFiados.reduce((sum, customer) => sum + customer.totalPendiente, 0)
              )}
              detail="Total pendiente de pago"
              icon={CircleDollarSign}
              tone="violet"
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-emerald-950">Cerrar pedidos agendados</h2>
                <p className="text-sm text-emerald-900/70">
                  Marca rápido como pagado o fiado.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {data.agendados.length === 0 ? (
                  <EmptyState text="No hay pedidos listos para cerrar." />
                ) : null}
                {data.agendados.map((order) => (
                  <PaymentOrderCard
                    key={order.id}
                    order={order}
                    busy={busyOrderId === order.id}
                    onPaid={() => void runAction(order.id, "pagado")}
                    onFiado={() => void runAction(order.id, "fiado")}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-emerald-950">Fiados pendientes</h2>
                <p className="text-sm text-emerald-900/70">
                  Registra abonos sin perder el historial del cliente.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {groupedFiados.length === 0 ? (
                  <EmptyState text="No hay fiados pendientes ahora mismo." />
                ) : null}
                {groupedFiados.map((customer) => (
                  <article
                    key={customer.clienteId}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-emerald-950">{customer.nombre}</div>
                          <div className="mt-1 space-y-1 text-sm text-emerald-900/65">
                            <div>Saldo total {formatCurrency(customer.totalPendiente)}</div>
                            {customer.telefono ? <div>{customer.telefono}</div> : null}
                            {customer.lugarTrabajo ? <div>{customer.lugarTrabajo}</div> : null}
                          </div>
                        </div>
                        <StatusBadge tone="warning" label="FIADO" />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <MiniMetric label="Pedidos" value={String(customer.cantidadFiados)} />
                        <MiniMetric
                          label="Último pago"
                          value={
                            getLastDebtPaymentDate(customer.fiados)
                              ? formatShortDateTime(getLastDebtPaymentDate(customer.fiados) as string)
                              : "Sin abonos"
                          }
                        />
                      </div>

                      <div className="space-y-3 rounded-xl border border-emerald-100 bg-white px-3 py-3">
                        {customer.fiados.map((fiado) => (
                          <div
                            key={fiado.id}
                            className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-emerald-950">
                                  Pedido del {formatFiadoDate(fiado)}
                                </div>
                                <div className="text-sm text-emerald-900/65">
                                  Pendiente {formatCurrency(fiado.saldoPendiente)}
                                </div>
                              </div>
                              <StatusBadge tone="neutral" label={`${fiado.items.length || 0} item(s)`} />
                            </div>

                            <div className="space-y-2">
                              {fiado.items.length > 0 ? (
                                fiado.items.map((item) => (
                                  <div
                                    key={`${fiado.id}-${item.productoId}-${item.productoNombre}`}
                                    className="flex items-start justify-between gap-3 text-sm"
                                  >
                                    <div className="text-emerald-950">
                                      {item.cantidad}x {item.productoNombre}
                                    </div>
                                    <div className="text-right font-semibold text-emerald-700">
                                      {formatCurrency(item.subtotal)}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-emerald-900/65">
                                  Detalle no disponible en registro antiguo.
                                </div>
                              )}
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <MiniMetric label="Subtotal" value={formatCurrency(fiado.total)} />
                              <MiniMetric
                                label="Ultimo pago"
                                value={
                                  fiado.fechaUltimoPago
                                    ? formatShortDateTime(fiado.fechaUltimoPago)
                                    : "Sin abonos"
                                }
                              />
                            </div>

                            <button
                              type="button"
                              disabled={busyOrderId === fiado.id}
                              onClick={() => setOrderModalState({ type: "abonar", order: fiado })}
                              className={buttonToneClass("warning")}
                            >
                              {busyOrderId === fiado.id ? "Procesando..." : "Registrar abono"}
                            </button>
                          </div>
                        ))}
                      </div>

                      <GroupedDebtCollectionButton customer={customer} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-[24px] border border-emerald-100 bg-white/90 p-5 shadow-soft">
            <div className="flex items-center gap-2 text-emerald-950">
              <Archive className="h-5 w-5" />
              <h3 className="text-lg font-bold">Cierre de mes</h3>
            </div>
            <p className="copy-justified mt-3 text-sm leading-6 text-emerald-900/70">
              Usa cierre de mes cuando ya no queden pedidos pendientes ni agendados y
              quieras archivar la operación completa del periodo. Esta vista ya no expone
              herramientas de prueba para mantener el flujo más limpio y profesional.
            </p>
            <div className="mt-4">
              <article className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-4">
                <h4 className="text-base font-semibold text-emerald-950">Cierre de mes</h4>
                <p className="copy-justified mt-2 text-sm leading-6 text-emerald-900/70">
                  Archiva pedidos, items, pagos, fiados y clientes en un log histórico y
                  deja limpio el panel operativo. Conserva productos y stock.
                </p>
                <button
                  type="button"
                  disabled={busyMaintenanceAction !== ""}
                  onClick={() => void runMaintenanceAction("close-month")}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[18px] bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  <Archive className="h-4 w-4" />
                  {busyMaintenanceAction === "close-month"
                    ? "Cerrando..."
                    : "Cerrar mes"}
                </button>
              </article>
            </div>
          </section>
        </section>
      ) : null}

      {view === "clientes" ? (
        <section className="space-y-5">
          <SectionIntro
            title="Clientes"
            subtitle="Una vista simple para reconocer quienes compran seguido y cuando vuelven a pedir."
            icon={UserRound}
            helper="Sirve para ubicar rápido a cada cliente antes de confirmar o cobrar."
          />

          <section className="overflow-hidden rounded-[30px] border border-[#D8EBDD] bg-[linear-gradient(135deg,#F6FCF7_0%,#EAF6EC_55%,#F3FAF4_100%)] p-4 shadow-[0_20px_40px_rgba(31,51,40,0.08)] sm:p-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#D8EBDD] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#247A4D]">
                    Clientes
                  </span>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-[#1F3328] sm:text-3xl">
                      Administra tus clientes y revisa su actividad
                    </h2>
                    <p className="max-w-2xl text-sm leading-6 text-[#6B7C70]">
                      Busca rápido, revisa fiados y ubica a cada cliente desde una vista
                      cómoda para celular y escritorio.
                    </p>
                  </div>
                </div>
                <ClientSearchBar value={search} onChange={setSearch} />
              </div>

              <ClientStatsCards summary={customerSummary} />

              <ClientFilterChips
                activeFilter={customerFilter}
                onChange={setCustomerFilter}
                counts={customerSummary}
              />
            </div>
          </section>

          {filteredCustomerCards.length === 0 ? (
            <ClientEmptyState hasSearch={Boolean(normalizedSearch)} />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredCustomerCards.map((customer) => (
                <ClientCard
                  key={customer.clienteId}
                  customer={customer}
                  onOpenOrders={() => openCustomerOrders(customer)}
                  onOpenPayments={() => openCustomerPayments(customer)}
                />
              ))}
            </div>
          )}

          <div className="hidden grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customerCards.length === 0 ? (
              <EmptyState text="Todavía no hay clientes registrados." />
            ) : null}
            {customerCards.map((customer) => (
              <article
                key={customer.clienteId}
                className="rounded-lg border border-emerald-100 bg-white/90 p-4 shadow-soft"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-emerald-950">{customer.nombre}</h3>
                      <p className="mt-1 text-sm text-emerald-900/65">{customer.lugarTrabajo}</p>
                    </div>
                    <StatusBadge tone="neutral" label={`${customer.pedidos} pedido(s)`} />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-emerald-900/70">
                    <Phone className="h-4 w-4" />
                    {customer.telefono || "Sin teléfono"}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <MiniMetric
                      label="Saldo pendiente"
                      value={formatCurrency(customer.pendiente)}
                    />
                    <MiniMetric
                      label="Último movimiento"
                      value={formatShortDateTime(customer.ultimoMovimiento)}
                    />
                  </div>

                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
                      Fechas agendadas
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {customer.proximasFechas.length === 0 ? (
                        <span className="text-sm text-emerald-900/55">Sin fechas activas</span>
                      ) : (
                        customer.proximasFechas.slice(0, 4).map((fecha) => (
                          <span
                            key={`${customer.clienteId}-${fecha}`}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800"
                          >
                            {formatDateOnly(fecha)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {view === "reportes" ? (
        <section className="space-y-5">
          <SectionIntro
            title="Reportes"
            subtitle="Resumen general y una vista de rentabilidad basada en ventas, costos y utilidad real."
            icon={CalendarRange}
            helper="Ideal para revisar cómo cerró el periodo, qué deja mejor margen y qué productos siguen sin costo configurado."
          />

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-emerald-100 bg-white/90 p-4 shadow-soft sm:p-5">
            <div className="space-y-4">
              <StableHorizontalRail className="flex gap-2 overflow-x-auto pb-1">
                <FilterChip
                  label="Resumen general"
                  active={reportTab === "resumen"}
                  onClick={() => setReportTab("resumen")}
                />
                <FilterChip
                  label="Rentabilidad"
                  active={reportTab === "rentabilidad"}
                  onClick={() => setReportTab("rentabilidad")}
                />
              </StableHorizontalRail>

              <StableHorizontalRail className="flex gap-2 overflow-x-auto pb-1">
                <FilterChip
                  label="Hoy"
                  active={reportRangePreset === "today"}
                  onClick={() => applyReportRangePreset("today")}
                />
                <FilterChip
                  label="Esta semana"
                  active={reportRangePreset === "week"}
                  onClick={() => applyReportRangePreset("week")}
                />
                <FilterChip
                  label="Este mes"
                  active={reportRangePreset === "month"}
                  onClick={() => applyReportRangePreset("month")}
                />
                <FilterChip
                  label="Mes anterior"
                  active={reportRangePreset === "last-month"}
                  onClick={() => applyReportRangePreset("last-month")}
                />
                <FilterChip
                  label="Rango personalizado"
                  active={reportRangePreset === "custom"}
                  onClick={() => applyReportRangePreset("custom")}
                />
              </StableHorizontalRail>

              <StableHorizontalRail className="flex gap-2 overflow-x-auto pb-1">
                <FilterChip
                  label="Todos"
                  active={reportSalesFilter === "todos"}
                  onClick={() => setReportSalesFilter("todos")}
                />
                <FilterChip
                  label="Pedidos cliente"
                  active={reportSalesFilter === "pedido-cliente"}
                  onClick={() => setReportSalesFilter("pedido-cliente")}
                />
                <FilterChip
                  label="Venta directa"
                  active={reportSalesFilter === "venta-directa"}
                  onClick={() => setReportSalesFilter("venta-directa")}
                />
                <FilterChip
                  label="Venta personalizada"
                  active={reportSalesFilter === "venta-personalizada"}
                  onClick={() => setReportSalesFilter("venta-personalizada")}
                />
              </StableHorizontalRail>
            </div>

            <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <label className="min-w-0 max-w-full space-y-2 overflow-hidden">
                <span className="text-sm font-semibold text-emerald-900">Desde</span>
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(event) => handleReportFromChange(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                />
              </label>
              <label className="min-w-0 max-w-full space-y-2 overflow-hidden">
                <span className="text-sm font-semibold text-emerald-900">Hasta</span>
                <input
                  type="date"
                  value={reportTo}
                  onChange={(event) => handleReportToChange(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                />
              </label>
            </div>
          </section>

          {reportTab === "resumen" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <HeroMetric
                  label="Pedidos cerrados"
                  value={String(reportSummary.totalPedidos)}
                  detail="Pedidos dentro del rango"
                  icon={ReceiptText}
                  tone="rose"
                />
                <HeroMetric
                  label="Ventas"
                  value={formatCurrency(reportSummary.totalVentas)}
                  detail="Total vendido"
                  icon={CircleDollarSign}
                  tone="emerald"
                />
                <HeroMetric
                  label="Fiado pendiente"
                  value={formatCurrency(
                    data.fiadosPendientes.reduce((sum, order) => sum + order.saldoPendiente, 0)
                  )}
                  detail="Saldo que sigue abierto"
                  icon={HandCoins}
                  tone="amber"
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-emerald-950">
                    <Box className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Top productos</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {reportSummary.topProductos.length === 0 ? (
                      <EmptyState text="No hay ventas en este rango." />
                    ) : null}
                    {reportSummary.topProductos.map((item) => (
                      <article
                        key={item.nombre}
                        className="rounded-lg border border-emerald-100 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-emerald-950">{item.nombre}</div>
                            <div className="text-sm text-emerald-900/65">
                              {item.unidades} unidades
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-emerald-700">
                            {formatCurrency(item.total)}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-emerald-950">
                    <UserRound className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Top clientes</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {reportSummary.topClientes.length === 0 ? (
                      <EmptyState text="No hay clientes en este rango." />
                    ) : null}
                    {reportSummary.topClientes.map((item) => (
                      <article
                        key={item.nombre}
                        className="rounded-lg border border-emerald-100 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-emerald-950">{item.nombre}</div>
                            <div className="text-sm text-emerald-900/65">
                              {item.pedidos} pedido(s)
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-emerald-700">
                            {formatCurrency(item.total)}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              <SectionIntro
                title="Rentabilidad"
                subtitle="Ventas, costos y utilidad real."
                icon={BarChart3}
                helper={
                  profitabilitySummary.productosSinCosto.length > 0
                    ? `Hay ${profitabilitySummary.productosSinCosto.length} producto(s) vendido(s) sin costo configurado. La utilidad se calcula solo sobre ventas con costo conocido o estimado.`
                    : "Se usa el costo guardado por item del pedido; en personalizados libres con costo manual queda marcado como estimado."
                }
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <HeroMetric
                  label="Ventas totales"
                  value={formatCurrency(profitabilitySummary.totalVentas)}
                  detail={`${profitabilitySummary.totalPedidos} venta(s) cerrada(s)`}
                  icon={CircleDollarSign}
                  tone="emerald"
                />
                <HeroMetric
                  label="Costos totales"
                  value={formatCurrency(profitabilitySummary.totalCostos)}
                  detail={
                    profitabilitySummary.productosSinCosto.length > 0
                      ? "Solo costos con dato conocido o estimado"
                      : "Costeo acumulado del periodo"
                  }
                  icon={Boxes}
                  tone="violet"
                />
                <HeroMetric
                  label="Utilidad bruta"
                  value={formatCurrency(profitabilitySummary.totalUtilidad)}
                  detail={`${formatPercent(profitabilitySummary.margenPromedio)} de margen promedio`}
                  icon={Sparkles}
                  tone="rose"
                />
                <HeroMetric
                  label="Margen promedio"
                  value={formatPercent(profitabilitySummary.margenPromedio)}
                  detail="Calculado sobre ventas con costo disponible"
                  icon={BarChart3}
                  tone="amber"
                />
                <HeroMetric
                  label="Unidades vendidas"
                  value={String(profitabilitySummary.totalUnidades)}
                  detail="Suma de unidades cerradas"
                  icon={ShoppingBag}
                  tone="emerald"
                />
                <HeroMetric
                  label="Sin costo"
                  value={String(profitabilitySummary.productosSinCosto.length)}
                  detail="Productos que requieren costo configurado"
                  icon={AlertCircle}
                  tone="amber"
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-emerald-950">
                    <BarChart3 className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Ventas vs costos vs utilidad</h3>
                  </div>
                  <div className="mt-4 space-y-4">
                    <ProfitabilityBar
                      label="Ventas"
                      value={formatCurrency(profitabilitySummary.totalVentas)}
                      amount={profitabilitySummary.totalVentas}
                      maxAmount={profitabilitySummary.totalVentas}
                      tone="emerald"
                    />
                    <ProfitabilityBar
                      label="Costos"
                      value={formatCurrency(profitabilitySummary.totalCostos)}
                      amount={profitabilitySummary.totalCostos}
                      maxAmount={profitabilitySummary.totalVentas}
                      tone="violet"
                    />
                    <ProfitabilityBar
                      label="Utilidad"
                      value={formatCurrency(profitabilitySummary.totalUtilidad)}
                      amount={profitabilitySummary.totalUtilidad}
                      maxAmount={profitabilitySummary.totalVentas}
                      tone="amber"
                    />
                  </div>
                </section>

                <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-emerald-950">
                    <Sparkles className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Top 5 por utilidad</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {profitabilitySummary.topProductosPorUtilidad.length === 0 ? (
                      <EmptyState text="No hay productos con costo calculable en este rango." />
                    ) : null}
                    {profitabilitySummary.topProductosPorUtilidad.map((item) => (
                      <article
                        key={`${item.id}-${item.nombre}-profit`}
                        className="rounded-lg border border-emerald-100 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-emerald-950">{item.nombre}</div>
                            <div className="text-sm text-emerald-900/65">
                              {item.unidades} unidades · {formatPercent((item.utilidad / item.ventaTotal) * 100)}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-emerald-700">
                            {formatCurrency(item.utilidad)}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-emerald-950">
                    <ReceiptText className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Rentabilidad por tipo de venta</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {profitabilitySummary.resumenPorTipo.length === 0 ? (
                      <EmptyState text="No hay ventas cerradas en este rango." />
                    ) : null}
                    {profitabilitySummary.resumenPorTipo.map((item) => (
                      <article
                        key={item.key}
                        className="rounded-lg border border-emerald-100 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-emerald-950">{item.label}</div>
                            <div className="text-sm text-emerald-900/65">
                              {item.pedidos} pedido(s) · {item.unidades} unidades
                            </div>
                          </div>
                          <StatusBadge
                            tone={item.calculable ? "pedido" : "warning"}
                            label={item.calculable ? "OK" : "SIN COSTO"}
                          />
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <MiniMetric label="Ventas" value={formatCurrency(item.ventaTotal)} />
                          <MiniMetric label="Costos" value={formatCurrency(item.costoTotal)} />
                          <MiniMetric
                            label="Utilidad"
                            value={item.calculable ? formatCurrency(item.utilidad) : "Costo pendiente"}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-emerald-950">
                    <AlertCircle className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Productos sin costo configurado</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {profitabilitySummary.productosSinCosto.length === 0 ? (
                      <EmptyState text="No hay productos vendidos con costo pendiente en este rango." />
                    ) : null}
                    {profitabilitySummary.productosSinCosto.map((item) => (
                      <article
                        key={`${item.id}-${item.nombre}-missing`}
                        className="rounded-lg border border-amber-200 bg-amber-50/80 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-amber-950">{item.nombre}</div>
                            <div className="text-sm text-amber-900/75">
                              {item.unidades} unidades · {formatCurrency(item.ventaTotal)}
                            </div>
                          </div>
                          {item.id ? (
                            <button
                              type="button"
                              onClick={() => openProductCostEditor(item.nombre)}
                              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950"
                            >
                              Configurar costo
                            </button>
                          ) : (
                            <StatusBadge tone="warning" label="PERSONALIZADO" />
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
                <div className="flex items-center gap-2 text-emerald-950">
                  <Box className="h-5 w-5" />
                  <h3 className="text-lg font-bold">Rentabilidad por producto</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {profitabilitySummary.rentabilidadPorProducto.length === 0 ? (
                    <EmptyState text="No hay productos vendidos en este rango." />
                  ) : null}
                  {profitabilitySummary.rentabilidadPorProducto.map((item) => (
                    <article
                      key={`${item.id}-${item.nombre}`}
                      className="rounded-lg border border-emerald-100 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-emerald-950">{item.nombre}</div>
                          <div className="text-sm text-emerald-900/65">
                            {item.unidades} unidades vendidas
                          </div>
                        </div>
                        <StatusBadge
                          tone={
                            item.status === "missing"
                              ? "warning"
                              : item.status === "estimated"
                                ? "neutral"
                                : "pedido"
                          }
                          label={
                            item.status === "missing"
                              ? "SIN COSTO"
                              : item.status === "estimated"
                                ? "ESTIMADO"
                                : "OK"
                          }
                        />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        <MiniMetric label="Ventas" value={formatCurrency(item.ventaTotal)} />
                        <MiniMetric
                          label="Costos"
                          value={item.calculable ? formatCurrency(item.costoTotal) : "Sin costo"}
                        />
                        <MiniMetric
                          label="Utilidad"
                          value={item.calculable ? formatCurrency(item.utilidad) : "No calculable"}
                        />
                        <MiniMetric
                          label="Margen"
                          value={item.margen === null ? "Costo pendiente" : formatPercent(item.margen)}
                        />
                        <MiniMetric
                          label="Estado costo"
                          value={
                            item.status === "missing"
                              ? "Sin costo"
                              : item.status === "estimated"
                                ? "Estimado"
                                : "OK"
                          }
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </section>
      ) : null}

      {orderModalState ? (
        <AdminActionModal
          state={orderModalState}
          busy={busyOrderId === orderModalState.order.id}
          onClose={() => setOrderModalState(null)}
          onConfirm={(payload) =>
            void runAction(
              orderModalState.order.id,
              orderModalState.type,
              orderModalState.order,
              payload
            )
          }
        />
      ) : null}

      {productModalState ? (
        <ProductModal
          state={productModalState}
          busy={
            busyProductId ===
            (productModalState.mode === "edit" ? productModalState.product.id : "new")
          }
          onClose={() => setProductModalState(null)}
          onSave={saveProduct}
          productNameOptions={stockProductNameOptions}
          typeOptions={stockTypeOptions}
          badgeOptions={stockBadgeOptions}
          priceSuggestions={stockPriceSuggestions}
        />
      ) : null}

      <AppFooter className="pb-24 md:pb-8" />
      <WhatsAppFloatingButton
        hidden={Boolean(productModalState || orderModalState)}
        bottomOffsetClassName={
          view === "home"
            ? "bottom-[calc(24px+env(safe-area-inset-bottom))]"
            : "bottom-[calc(88px+env(safe-area-inset-bottom))]"
        }
      />
      {view !== "home" ? <MobileQuickHomeButton href="/admin" label="Inicio" /> : null}
    </main>
  );
}

function SectionIntro({
  title,
  subtitle,
  icon: Icon,
  action,
  helper
}: {
  title: string;
  subtitle: string;
  icon: typeof LayoutGrid;
  action?: ReactNode;
  helper?: string;
}) {
  return (
    <section className="max-w-full overflow-x-hidden rounded-[24px] border border-emerald-100 bg-white/90 p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-[18px] bg-emerald-100 p-3 text-emerald-700">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-2xl font-bold text-emerald-950">{title}</h2>
            <p className="copy-justified break-words text-sm text-emerald-900/70">
              {subtitle}
            </p>
            {helper ? (
              <p className="copy-justified break-words rounded-[18px] bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {helper}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="w-full lg:w-auto">{action}</div> : null}
      </div>
    </section>
  );
}

function HomeActionCard({
  title,
  subtitle,
  badge,
  icon: Icon,
  tone,
  onClick
}: {
  title: string;
  subtitle: string;
  badge: string;
  icon: typeof LayoutGrid;
  tone: "rose" | "violet" | "amber" | "emerald" | "slate";
  onClick: () => void;
}) {
  const palette =
    tone === "rose"
      ? {
          gradientClass: "from-emerald-50 to-white",
          iconTextClass: "text-emerald-700",
          iconBgClass: "bg-emerald-100"
        }
      : tone === "violet"
        ? {
            gradientClass: "from-violet-50 to-white",
            iconTextClass: "text-violet-700",
            iconBgClass: "bg-violet-100"
          }
        : tone === "amber"
          ? {
              gradientClass: "from-amber-50 to-white",
              iconTextClass: "text-amber-700",
              iconBgClass: "bg-amber-100"
            }
          : tone === "emerald"
            ? {
                gradientClass: "from-emerald-50 to-white",
                iconTextClass: "text-emerald-700",
                iconBgClass: "bg-emerald-100"
              }
            : {
                gradientClass: "from-slate-50 to-white",
                iconTextClass: "text-slate-700",
                iconBgClass: "bg-slate-100"
              };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`max-w-full overflow-x-hidden rounded-[20px] border border-emerald-100 bg-gradient-to-br ${palette.gradientClass} p-4 text-left shadow-soft transition hover:border-emerald-200`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-2xl p-3 ${palette.iconBgClass} ${palette.iconTextClass}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="inline-flex min-h-8 items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800">
          {badge}
        </span>
      </div>
      <div className="mt-4 min-w-0 space-y-2">
        <div className="break-words text-lg font-semibold text-emerald-950">{title}</div>
        <p className="copy-justified break-words text-sm leading-6 text-emerald-900/70">
          {subtitle}
        </p>
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800">
          Abrir
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </button>
  );
}

function QuickTaskRow({
  title,
  detail,
  icon: Icon,
  onClick
}: {
  title: string;
  detail: string;
  icon: typeof LayoutGrid;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4 text-left transition hover:border-emerald-200 sm:flex-nowrap"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-emerald-950">{title}</div>
          <div className="copy-justified mt-1 break-words text-xs text-emerald-900/65">
            {detail}
          </div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-emerald-500" />
    </button>
  );
}

function AdminSectionTab({
  label,
  icon: Icon,
  badge,
  active,
  onClick
}: {
  label: string;
  icon: typeof LayoutGrid;
  badge: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[88px] min-w-[132px] rounded-[20px] border px-4 py-3 text-left transition sm:min-w-[146px] ${
        active
          ? "border-emerald-200 bg-emerald-600 text-white"
          : "border-emerald-100 bg-emerald-50 text-emerald-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-[16px] p-2 ${
            active ? "bg-white/20 text-white" : "bg-white text-emerald-700"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3">
        <div className="text-sm font-semibold">{label}</div>
        <div className={`mt-1 text-xs ${active ? "text-white/80" : "text-emerald-700/80"}`}>
          {badge}
        </div>
      </div>
    </button>
  );
}

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800"
      }`}
    >
      {label}
    </button>
  );
}

function StockProductCard({
  product,
  draft,
  busy,
  onEdit,
  onDelete,
  onChange,
  onSave,
  typeOptions
}: {
  product: AdminProductRecord;
  draft?: StockDraft;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (key: keyof StockDraft, value: string) => void;
  onSave: () => void;
  typeOptions: string[];
}) {
  const quickStockAmount = draft?.stock ?? String(getUnifiedProductStock(product));
  const desiredStatus = draft?.activo ?? (product.activo ? "activo" : "pausado");

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-[24px] border border-emerald-100 bg-white/90 p-4 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[20px] border border-emerald-100 bg-emerald-50">
            <ProductImage
              src={product.imageUrl ?? "/images/products/dobladita-ave-pimenton.jpeg"}
              alt={product.nombre}
              sizes="96px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-lg font-semibold text-emerald-950">{product.nombre}</h3>
              <StatusBadge
                tone={product.activo ? "pedido" : "neutral"}
                label={product.activo ? "ACTIVO" : "PAUSADO"}
              />
            </div>
            <p className="break-words text-sm leading-6 text-emerald-900/70">
              {product.descripcion || "Sin descripción."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-900 sm:w-auto"
        >
          <PencilLine className="h-4 w-4" />
          Editar
        </button>
      </div>

      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
        <select
          value={desiredStatus}
          onChange={(event) => onChange("activo", event.target.value)}
          className="min-h-11 min-w-0 rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-900"
        >
          <option value="activo">Activo</option>
          <option value="pausado">Pausado</option>
        </select>
        <StatusBadge
          tone="neutral"
          label={draft?.tipoProducto || product.badgeLabel || product.tipoProducto || "PRODUCTO CASERO"}
        />
        <StatusBadge
          tone={getUnifiedProductStock(product) > 0 ? "pedido" : "warning"}
          label={`Stock ${getUnifiedProductStock(product)}`}
        />
      </div>

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <InlineField
          label="Precio"
          value={draft?.precioVenta ?? String(product.precioVenta)}
          onChange={(value) => onChange("precioVenta", value)}
        />
        <InlineField
          label="Stock"
          value={quickStockAmount}
          onChange={(value) => onChange("stock", value)}
        />
        <InlineSelectField
          label="Tipo"
          value={draft?.tipoProducto ?? product.tipoProducto}
          onChange={(value) => onChange("tipoProducto", value)}
          options={typeOptions}
        />
        <QuickStockAdjuster
          value={quickStockAmount}
          onChange={(value) => onChange("stock", value)}
        />
      </div>

      <details className="mt-4 min-w-0 overflow-hidden rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-emerald-900">
          Ver detalle del producto
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MiniMetric
            label="Badge"
            value={product.badgeLabel || product.tipoProducto || "PRODUCTO CASERO"}
          />
          <MiniMetric label="Imagen" value={product.imageUrl ? "Configurada" : "Fallback"} />
          <MiniMetric label="Costo unitario" value={formatCurrency(product.costoUnitario)} />
          <MiniMetric label="Utilidad aprox." value={formatCurrency(product.utilidadUnitaria)} />
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 break-words text-sm text-emerald-900/60">
          Ajusta aquí lo rápido. Editar abre el detalle completo.
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? "Procesando..." : "Eliminar"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Archive className="h-4 w-4" />
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </article>
  );
}

type OrderSectionProps = {
  htmlId?: string;
  title: string;
  subtitle: string;
  orders: AdminOrderSummary[];
  loading: boolean;
  emptyText: string;
  busyOrderId: string;
  selectedOrderId: string;
  actions: Array<{
    key: AdminOrdersAction;
    label: string;
    tone: "primary" | "warning" | "muted";
  }>;
  onSelect: (orderId: string) => void;
  onAction: (order: AdminOrderSummary, action: AdminOrdersAction) => void;
};

function OrderSection({
  htmlId,
  title,
  subtitle,
  orders,
  loading,
  emptyText,
  busyOrderId,
  selectedOrderId,
  actions,
  onSelect,
  onAction
}: OrderSectionProps) {
  return (
    <section
      id={htmlId}
      className="scroll-mt-32 rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-emerald-950">{title}</h2>
        <p className="text-sm text-emerald-900/70">{subtitle}</p>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? <EmptyState text="Cargando pedidos..." /> : null}
        {!loading && orders.length === 0 ? <EmptyState text={emptyText} /> : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className={`rounded-lg border p-4 ${
              selectedOrderId === order.id
                ? "border-emerald-300 bg-emerald-50"
                : "border-emerald-100 bg-white"
            }`}
          >
            <button type="button" onClick={() => onSelect(order.id)} className="w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-emerald-950">
                      {order.clienteNombre}
                    </h3>
                    {order.adminSeen === false ? (
                      <StatusBadge tone="warning" label="NUEVO" />
                    ) : (
                      <StatusBadge tone="neutral" label="VISTO" />
                    )}
                    {order.fechaEntrega ? (
                      <StatusBadge
                        tone="neutral"
                        label={`Entrega ${formatDateOnly(order.fechaEntrega)}`}
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-emerald-900/65">
                    <Phone className="h-4 w-4" />
                    {order.clienteTelefono || "Sin teléfono"}
                  </div>
                  <div className="space-y-1 text-sm text-emerald-900/65">
                    {renderGroupedItemLines(
                      order.items.map((item) => ({
                        name: item.productoNombre,
                        quantity: item.cantidad
                      })),
                      4
                    ).map((line) => (
                      <div key={`${order.id}-${line}`}>{line}</div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <StatusBadge tone="pedido" label={order.estadoPedido} />
                  <StatusBadge
                    tone={order.estadoPago === "FIADO" ? "warning" : "neutral"}
                    label={order.estadoPago}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <MiniMetric label="Total" value={formatCurrency(order.total)} />
                <MiniMetric label="Saldo" value={formatCurrency(order.saldoPendiente)} />
                <MiniMetric label="Ingreso" value={formatShortDateTime(order.fechaPedido)} />
              </div>

              <div className="mt-3 xl:hidden">
                <span className="inline-flex min-h-10 items-center rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm font-semibold text-emerald-900">
                  Ver detalle abajo
                </span>
              </div>

              {selectedOrderId === order.id ? (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 xl:hidden">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <MiniMetric
                      label="Lugar"
                      value={order.clienteLugarTrabajo || "Sin lugar"}
                    />
                    <MiniMetric
                      label="Entrega"
                      value={order.fechaEntrega ? formatDateOnly(order.fechaEntrega) : "Sin agendar"}
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    {order.items.map((item) => (
                      <div
                        key={`${order.id}-${item.productoId}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                      >
                        <div>
                          <div className="text-sm font-semibold text-emerald-950">
                            {item.productoNombre}
                          </div>
                          <div className="text-xs text-emerald-900/65">
                            {item.cantidad} x {formatCurrency(item.precioUnitario)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-emerald-700">
                          {formatCurrency(item.subtotal)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </button>

            {actions.length > 0 || shouldShowOrderWhatsAppAction(order) ? (
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    disabled={busyOrderId === order.id}
                    onClick={() => onAction(order, action.key)}
                    className={`${buttonToneClass(action.tone)} w-full justify-center sm:w-auto`}
                  >
                    {busyOrderId === order.id ? "Procesando..." : action.label}
                  </button>
                ))}
                <OrderWhatsAppButton order={order} />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function OrderDetailPanel({
  order,
  agendaGroups
}: {
  order: AdminOrderSummary | null;
  agendaGroups: Array<{
    customerKey: string;
    clienteId: string;
    fechaEntrega: string;
    totalPedidos: number;
    totalMonto: number;
  }>;
}) {
  if (!order) {
    return <EmptyState text="Toca un pedido para ver su detalle." />;
  }

  const relatedGroup =
    order.fechaEntrega
      ? agendaGroups.find(
          (group) =>
            group.customerKey === buildCustomerIdentityKey(order) &&
            group.fechaEntrega === order.fechaEntrega
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold text-emerald-950">{order.clienteNombre}</h2>
          <StatusBadge tone="pedido" label={order.estadoPedido} />
          <StatusBadge
            tone={order.estadoPago === "FIADO" ? "warning" : "neutral"}
            label={order.estadoPago}
          />
          {order.adminSeen === false ? <StatusBadge tone="warning" label="NUEVO" /> : null}
        </div>
        <div className="text-sm text-emerald-900/70">
          {order.clienteLugarTrabajo || "Sin lugar de entrega"}
        </div>
      </div>

      {relatedGroup && relatedGroup.totalPedidos > 1 ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          Este cliente tiene {relatedGroup.totalPedidos} pedidos para el{" "}
          {formatDateOnly(relatedGroup.fechaEntrega)} por un total de{" "}
          {formatCurrency(relatedGroup.totalMonto)}.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <MiniMetric label="Fecha ingreso" value={formatShortDateTime(order.fechaPedido)} />
        <MiniMetric
          label="Fecha entrega"
          value={order.fechaEntrega ? formatDateOnly(order.fechaEntrega) : "Sin agendar"}
        />
        <MiniMetric label="Total pedido" value={formatCurrency(order.total)} />
        <MiniMetric label="Costo total" value={formatCurrency(order.totalCost)} />
        <MiniMetric label="Utilidad bruta" value={formatCurrency(order.grossProfit)} />
        <MiniMetric label="Pagado" value={formatCurrency(order.totalPagado)} />
        <MiniMetric label="Saldo" value={formatCurrency(order.saldoPendiente)} />
      </div>

      {shouldShowOrderWhatsAppAction(order) ? (
        <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-soft">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
              Confirmación al cliente
            </div>
            <p className="text-sm text-emerald-900/70">
              Abre WhatsApp con el mensaje listo para confirmar el pedido manualmente.
            </p>
          </div>
          <div className="mt-3">
            <OrderWhatsAppButton order={order} fullWidth />
          </div>
        </section>
      ) : null}

      {order.adminSeen === false ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 shadow-soft">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800/80">
              Aviso interno
            </div>
            <p className="text-sm text-amber-900/80">
              Si quieres compartir este pedido nuevo manualmente por WhatsApp, abre el mensaje ya preparado.
            </p>
          </div>
          <div className="mt-3">
            <NewOrderWhatsAppButton order={order} fullWidth />
          </div>
        </section>
      ) : null}

      <DebtCollectionButton order={order} fullWidth />

      <section className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
          Productos
        </div>
        <div className="mt-3 space-y-3">
          {order.items.map((item) => (
            <div
              key={`${order.id}-${item.productoId}`}
              className="rounded-lg border border-emerald-100 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-emerald-950">{item.productoNombre}</div>
                  <div className="text-sm text-emerald-900/65">
                    {formatCurrency(item.precioUnitario)} x {item.cantidad}
                  </div>
                  <div className="text-xs text-emerald-700/75">
                    Costo {formatCurrency(item.costoUnitario)} · Utilidad{" "}
                    {formatCurrency(item.utilidadBruta)}
                  </div>
                </div>
                <div className="text-sm font-semibold text-emerald-700">
                  {formatCurrency(item.subtotal)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OrderWhatsAppButton({
  order,
  fullWidth = false
}: {
  order: AdminOrderSummary;
  fullWidth?: boolean;
}) {
  const notification = getOrderWhatsAppNotification(order);
  const sharedClassName =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold";

  if (notification.status === "ready" && notification.url) {
    return (
      <a
        href={notification.url}
        target="_blank"
        rel="noreferrer"
        className={`${sharedClassName} ${
          fullWidth ? "w-full" : "w-full sm:w-auto"
        } bg-[#25D366] text-white shadow-sm`}
      >
        <MessageCircle className="h-4 w-4" />
        Enviar WhatsApp
      </a>
    );
  }

  const label = notification.error === "Sin telefono" ? "Sin teléfono" : "Teléfono inválido";

  return (
    <button
      type="button"
      disabled
      className={`${sharedClassName} ${
        fullWidth ? "w-full" : "w-full sm:w-auto"
      } border border-emerald-100 bg-emerald-50 text-emerald-900/55`}
      title={label}
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </button>
  );
}

function NewOrderWhatsAppButton({
  order,
  fullWidth = false
}: {
  order: AdminOrderSummary;
  fullWidth?: boolean;
}) {
  const href = getNewOrderAdminWhatsAppUrl(order);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${buttonToneClass("warning")} ${fullWidth ? "w-full" : "w-full justify-center sm:w-auto"}`}
    >
      Avisar por WhatsApp
    </a>
  );
}

function DebtCollectionButton({
  order,
  fullWidth = false
}: {
  order: AdminOrderSummary;
  fullWidth?: boolean;
}) {
  const href = getDebtCollectionAction(order);
  const className =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold";

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${className} ${
        fullWidth ? "w-full" : "w-full sm:w-auto"
      } border border-emerald-200 bg-white text-emerald-900`}
    >
      <MessageCircle className="h-4 w-4" />
      Cobrar
    </a>
  );
}

function GroupedDebtCollectionButton({
  customer,
  fullWidth = false
}: {
  customer: GroupedFiadoCustomer;
  fullWidth?: boolean;
}) {
  const href = getGroupedDebtCollectionAction(customer);
  const className =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold";

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${className} ${
        fullWidth ? "w-full" : "w-full sm:w-auto"
      } border border-emerald-200 bg-white text-emerald-900`}
    >
      <MessageCircle className="h-4 w-4" />
      Cobrar por WhatsApp
    </a>
  );
}

function PaymentOrderCard({
  order,
  busy,
  onPaid,
  onFiado
}: {
  order: AdminOrderSummary;
  busy: boolean;
  onPaid: () => void;
  onFiado: () => void;
}) {
  return (
    <article className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-emerald-950">{order.clienteNombre}</div>
            <div className="mt-1 space-y-1 text-sm text-emerald-900/65">
              {renderGroupedItemLines(
                order.items.map((item) => ({
                  name: item.productoNombre,
                  quantity: item.cantidad
                })),
                3
              ).map((line) => (
                <div key={`${order.id}-${line}`}>{line}</div>
              ))}
            </div>
          </div>
          <StatusBadge
            tone="neutral"
            label={order.fechaEntrega ? formatDateOnly(order.fechaEntrega) : "Sin fecha"}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Total" value={formatCurrency(order.total)} />
          <MiniMetric label="Teléfono" value={order.clienteTelefono || "-"} />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={onPaid}
            className={`${buttonToneClass("primary")} w-full justify-center`}
          >
            {busy ? "Procesando..." : "Marcar pagado"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onFiado}
            className={`${buttonToneClass("warning")} w-full justify-center`}
          >
            {busy ? "Procesando..." : "Dejar fiado"}
          </button>
        </div>
        <DebtCollectionButton order={order} />
      </div>
    </article>
  );
}

function AdminActionModal({
  state,
  busy,
  onClose,
  onConfirm
}: {
  state: Exclude<OrderModalState, null>;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    fechaEntrega?: string;
    motivoCancelacion?: string;
    monto?: number;
    metodoPago?: string;
  }) => void;
}) {
  const [reason, setReason] = useState(
    state.type === "cancelar" ? "Cancelado por administrador" : ""
  );
  const [amount, setAmount] = useState(
    state.type === "abonar" ? String(state.order.saldoPendiente) : ""
  );
  const [method, setMethod] = useState("EFECTIVO");
  const [deliveryDate, setDeliveryDate] = useState(
    state.type === "agendar" ? todayDateValue() : ""
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-emerald-950/20 px-4 py-4">
      <div className="mx-auto max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[20px] border border-emerald-100 bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-soft">
        <div className="space-y-1">
          <div className="inline-flex rounded-2xl bg-emerald-100 p-3 text-emerald-700">
            {state.type === "agendar" ? (
              <CalendarClock className="h-5 w-5" />
            ) : state.type === "cancelar" ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <HandCoins className="h-5 w-5" />
            )}
          </div>
          <h3 className="pt-2 text-xl font-bold text-emerald-950">
            {state.type === "agendar"
              ? "Agendar pedido"
              : state.type === "cancelar"
                ? "Cancelar pedido"
                : "Registrar abono"}
          </h3>
          <p className="text-sm text-emerald-900/70">{state.order.clienteNombre}</p>
        </div>

        <div className="mt-4 space-y-4">
          {state.type === "agendar" ? (
            <label className="block min-w-0 max-w-full space-y-2 overflow-hidden">
              <span className="text-sm font-semibold text-emerald-900">Fecha de entrega</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-[16px] text-emerald-950"
              />
            </label>
          ) : null}

          {state.type === "cancelar" ? (
            <label className="space-y-2">
              <span className="text-sm font-semibold text-emerald-900">Motivo</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              />
            </label>
          ) : null}

          {state.type === "abonar" ? (
            <>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-emerald-900">Monto abonado</span>
                <input
                  type="number"
                  min={1}
                  max={state.order.saldoPendiente}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-emerald-900">Metodo de pago</span>
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="TARJETA">Tarjeta</option>
                </select>
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-900"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onConfirm(
                state.type === "agendar"
                  ? { fechaEntrega: deliveryDate }
                  : state.type === "cancelar"
                    ? {
                        motivoCancelacion:
                          reason.trim() || "Cancelado por administrador"
                      }
                    : {
                        monto: Number(amount),
                        metodoPago: method
                      }
              )
            }
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {busy ? "Guardando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductModal({
  state,
  busy,
  onClose,
  onSave,
  productNameOptions,
  typeOptions,
  badgeOptions,
  priceSuggestions
}: {
  state: Exclude<ProductModalState, null>;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    nombre: string;
    descripcion: string;
    precioVenta: number;
    imageUrl?: string;
    badgeLabel?: string;
    costoUnitario: number;
    stock: number;
    tipoProducto: string;
    activo: boolean;
  }) => void;
  productNameOptions: string[];
  typeOptions: string[];
  badgeOptions: string[];
  priceSuggestions: number[];
}) {
  const current = state.mode === "edit" ? state.product : null;
  const [nombre, setNombre] = useState(current?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(current?.descripcion ?? "");
  const [precioVenta, setPrecioVenta] = useState(String(current?.precioVenta ?? 0));
  const [imageUrl, setImageUrl] = useState(current?.imageUrl ?? "");
  const [badgeLabel, setBadgeLabel] = useState(current?.badgeLabel ?? "");
  const [costoUnitario, setCostoUnitario] = useState(
    String(current?.costoUnitario ?? 0)
  );
  const [stock, setStock] = useState(
    String(getUnifiedProductStock(current ?? { stockActual: 0, stockAgenda: 0 }))
  );
  const [tipoProducto, setTipoProducto] = useState(current?.tipoProducto ?? "simple");
  const [activo, setActivo] = useState(current?.activo ?? true);

  return (
    <div className="fixed inset-0 z-50 bg-emerald-950/20 px-3 py-3 sm:px-4 sm:py-5">
      <div className="mx-auto flex h-full w-full max-w-2xl items-center justify-center">
        <div className="flex max-h-[calc(100dvh-24px)] min-h-0 w-full flex-col overflow-hidden rounded-[24px] border border-emerald-100 bg-white shadow-soft sm:max-h-[calc(100dvh-40px)]">
          <div className="shrink-0 border-b border-emerald-100 bg-white/95 px-5 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                  <Package2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-emerald-950">
                    {state.mode === "create" ? "Nuevo producto" : "Editar producto"}
                  </h3>
                  <p className="text-sm text-emerald-900/70">
                    Ajusta catálogo, stock y precio sin perderte en el celular.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-900"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="min-h-0 overflow-x-hidden overflow-y-auto px-5 py-5 pb-[calc(128px+env(safe-area-inset-bottom))]">
            <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-3">
              <MiniMetric
                label="Catálogo"
                value={activo ? "Activo" : "Pausado"}
              />
              <MiniMetric label="Stock" value={stock} />
              <MiniMetric
                label="Badge"
                value={badgeLabel || tipoProducto || "PRODUCTO CASERO"}
              />
            </section>

            <label className="flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-emerald-950">Disponible para clientes</div>
                <div className="mt-1 text-xs text-emerald-900/65">
                  Apágalo cuando no quieras vender este producto.
                </div>
              </div>
              <select
                value={activo ? "Activo" : "Pausado"}
                onChange={(event) => setActivo(event.target.value === "Activo")}
                className="min-h-11 w-full min-w-0 rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 sm:w-auto"
              >
                <option value="Activo">Activo</option>
                <option value="Pausado">Pausado</option>
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-emerald-900">Nombre</span>
            <input
              list="stock-modal-product-names"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="block w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
            <datalist id="stock-modal-product-names">
              {productNameOptions.map((productName) => (
                <option key={productName} value={productName} />
              ))}
            </datalist>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-emerald-900">Descripción corta</span>
            <textarea
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-emerald-900">Badge visible</span>
            <input
              list="stock-modal-badge-options"
              value={badgeLabel}
              onChange={(event) => setBadgeLabel(event.target.value)}
              placeholder="Ejemplo: DOBLADITA QUESO"
              className="block w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
            <datalist id="stock-modal-badge-options">
              {badgeOptions.map((badgeOption) => (
                <option key={badgeOption} value={badgeOption} />
              ))}
            </datalist>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-emerald-900">Ruta pública de imagen</span>
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="/images/products/dobladita-solo-queso.jpeg"
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-emerald-900">Precio</span>
            <input
              list="stock-modal-price-options"
              type="number"
              min={0}
              value={precioVenta}
              onChange={(event) => setPrecioVenta(event.target.value)}
              className="block w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
            <datalist id="stock-modal-price-options">
              {priceSuggestions.map((priceSuggestion) => (
                <option key={priceSuggestion} value={priceSuggestion} />
              ))}
            </datalist>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-emerald-900">Costo</span>
            <input
              type="number"
              min={0}
              value={costoUnitario}
              onChange={(event) => setCostoUnitario(event.target.value)}
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-emerald-900">Stock</span>
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              className="block w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-emerald-900">Tipo</span>
            <select
              value={tipoProducto}
              onChange={(event) => setTipoProducto(event.target.value)}
              className="block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            >
              {typeOptions.map((typeOption) => (
                <option key={typeOption} value={typeOption}>
                  {typeOption}
                </option>
              ))}
            </select>
          </label>
            </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-emerald-100 bg-white/95 px-5 py-4 pb-[calc(16px+env(safe-area-inset-bottom))] backdrop-blur">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-emerald-100 bg-white px-4 py-2 text-sm font-semibold text-emerald-900"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onSave({
                  id: current?.id,
                  nombre,
                  descripcion,
                  precioVenta: Number(precioVenta),
                  imageUrl,
                  badgeLabel,
                  costoUnitario: Number(costoUnitario),
                  stock: normalizeStockValue(stock),
                  tipoProducto,
                  activo
                })
              }
              className="min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {busy ? "Guardando..." : "Guardar producto"}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof LayoutGrid;
  tone: "rose" | "violet" | "amber" | "emerald";
}) {
  const palette =
    tone === "rose"
      ? {
          gradientClass: "from-white to-emerald-50",
          iconBgClass: "bg-emerald-100",
          iconTextClass: "text-emerald-700"
        }
      : tone === "violet"
        ? {
            gradientClass: "from-white to-violet-50",
            iconBgClass: "bg-violet-100",
            iconTextClass: "text-violet-700"
          }
        : tone === "amber"
          ? {
              gradientClass: "from-white to-amber-50",
              iconBgClass: "bg-amber-100",
              iconTextClass: "text-amber-700"
            }
          : {
              gradientClass: "from-white to-emerald-50",
              iconBgClass: "bg-emerald-100",
              iconTextClass: "text-emerald-700"
            };
  return (
    <article
      className={`max-w-full overflow-x-hidden rounded-[22px] border border-emerald-100 bg-gradient-to-br ${palette.gradientClass} p-5 shadow-soft`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-emerald-900/65">{label}</div>
          <div className="mt-2 break-words text-3xl font-bold text-emerald-950">{value}</div>
        </div>
        <span
          className={`rounded-2xl p-3 shadow-sm ${palette.iconBgClass} ${palette.iconTextClass}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 break-words text-sm text-emerald-900/65">{detail}</p>
    </article>
  );
}

function FocusCard({
  title,
  text,
  icon: Icon,
  tone
}: {
  title: string;
  text: string;
  icon: typeof LayoutGrid;
  tone: "rose" | "violet" | "amber";
}) {
  const className =
    tone === "rose"
      ? "border-emerald-100 bg-emerald-50 text-emerald-800"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <article className={`max-w-full overflow-x-hidden rounded-[22px] border p-4 shadow-soft ${className}`}>
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-white/80 p-3">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="break-words text-sm leading-6 opacity-90">{text}</p>
        </div>
      </div>
    </article>
  );
}

function MiniHomeTab({
  title,
  value,
  active,
  onClick,
  tone
}: {
  title: string;
  value: string;
  active: boolean;
  onClick: () => void;
  tone: "rose" | "violet" | "amber";
}) {
  const palette =
    tone === "rose"
      ? active
        ? "bg-emerald-600 text-white"
        : "bg-emerald-50 text-emerald-800"
      : tone === "violet"
        ? active
          ? "bg-violet-600 text-white"
          : "bg-violet-50 text-violet-800"
        : active
          ? "bg-amber-500 text-white"
          : "bg-amber-50 text-amber-800";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[88px] min-w-0 rounded-[20px] px-4 py-4 text-left shadow-soft transition ${palette}`}
    >
      <div className="break-words text-sm font-medium opacity-90">{title}</div>
      <div className="mt-2 break-words text-2xl font-bold">{value}</div>
    </button>
  );
}

function CompactHistorySection({
  title,
  subtitle,
  orders,
  emptyText
}: {
  title: string;
  subtitle: string;
  orders: AdminOrderSummary[];
  emptyText: string;
}) {
  return (
    <details className="max-w-full overflow-x-hidden rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-bold text-emerald-950">{title}</h2>
          <p className="break-words text-sm text-emerald-900/70">{subtitle}</p>
        </div>
        <StatusBadge tone="neutral" label={`${orders.length} registro(s)`} />
      </summary>

      <div className="mt-4 space-y-3">
        {orders.length === 0 ? <EmptyState text={emptyText} /> : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-emerald-950">{order.clienteNombre}</div>
                <div className="mt-1 text-sm text-emerald-900/65">{order.productoNombre}</div>
              </div>
              <StatusBadge
                tone={title.toLowerCase().includes("cancelados") ? "warning" : "neutral"}
                label={title.toLowerCase().includes("cancelados") ? "CANCELADO" : "CERRADO"}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <MiniMetric label="Total" value={formatCurrency(order.total)} />
              <MiniMetric label="Pago" value={order.estadoPago} />
              <MiniMetric
                label="Fecha"
                value={formatShortDateTime(
                  order.fechaCierre ?? order.fechaCancelacion ?? order.fechaPedido
                )}
              />
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

function SimpleFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3">
      <span className="text-sm text-emerald-900/70">{label}</span>
      <span className="text-base font-semibold text-emerald-950">{value}</span>
    </div>
  );
}

function ProfitabilityBar({
  label,
  value,
  amount,
  maxAmount,
  tone
}: {
  label: string;
  value: string;
  amount: number;
  maxAmount: number;
  tone: "emerald" | "violet" | "amber";
}) {
  const width = maxAmount > 0 ? Math.max(8, Math.min(100, (amount / maxAmount) * 100)) : 0;
  const barClassName =
    tone === "violet"
      ? "bg-violet-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-emerald-950">{label}</div>
        <div className="text-sm font-semibold text-emerald-700">{value}</div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-emerald-100">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function ClientStatsCards({
  summary
}: {
  summary: {
    total: number;
    conPedidos: number;
    conFiado: number;
    recientes: number;
  };
}) {
  const items = [
    {
      label: "Total clientes",
      value: String(summary.total),
      detail: "Contactos visibles en el panel",
      accent: "bg-[#3FA66B]"
    },
    {
      label: "Con pedidos",
      value: String(summary.conPedidos),
      detail: "Ya tienen historial de compra",
      accent: "bg-[#F4D77A]"
    },
    {
      label: "Con fiado",
      value: String(summary.conFiado),
      detail: "Requieren seguimiento de cobro",
      accent: "bg-[#F28B82]"
    },
    {
      label: "Recientes",
      value: String(summary.recientes),
      detail: "Movimiento dentro de 14 dias",
      accent: "bg-[#247A4D]"
    }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article
          key={item.label}
          className="rounded-[24px] border border-[#D8EBDD] bg-white p-4 shadow-[0_12px_30px_rgba(31,51,40,0.08)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#6B7C70]">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-[#1F3328]">{item.value}</p>
            </div>
            <span className={`mt-1 h-3 w-3 rounded-full ${item.accent}`} />
          </div>
          <p className="mt-3 text-sm leading-5 text-[#6B7C70]">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function ClientSearchBar({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex w-full max-w-xl items-center gap-3 rounded-[22px] border border-[#D8EBDD] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(31,51,40,0.08)]">
      <Search className="h-5 w-5 text-[#247A4D]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar por nombre, teléfono o unidad..."
        className="w-full border-0 bg-transparent p-0 text-[15px] text-[#1F3328] outline-none placeholder:text-[#6B7C70]"
      />
    </label>
  );
}

function ClientFilterChips({
  activeFilter,
  onChange,
  counts
}: {
  activeFilter: CustomerFilter;
  onChange: (value: CustomerFilter) => void;
  counts: {
    total: number;
    conPedidos: number;
    conFiado: number;
    recientes: number;
  };
}) {
  const filters: Array<{ value: CustomerFilter; label: string; count: number }> = [
    { value: "todos", label: "Todos", count: counts.total },
    { value: "con-pedidos", label: "Con pedidos", count: counts.conPedidos },
    { value: "con-fiado", label: "Con fiado", count: counts.conFiado },
    { value: "recientes", label: "Recientes", count: counts.recientes }
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((filter) => {
        const active = activeFilter === filter.value;

        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onChange(filter.value)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              active
                ? "border-[#3FA66B] bg-[#3FA66B] text-white shadow-[0_10px_24px_rgba(63,166,107,0.22)]"
                : "border-[#D8EBDD] bg-white text-[#247A4D]"
            }`}
          >
            <span>{filter.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                active ? "bg-white/20 text-white" : "bg-[#DDF4E5] text-[#247A4D]"
              }`}
            >
              {filter.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ClientCard({
  customer,
  onOpenOrders,
  onOpenPayments
}: {
  customer: CustomerCardData;
  onOpenOrders: () => void;
  onOpenPayments: () => void;
}) {
  const initial = customer.nombre.trim().charAt(0).toUpperCase() || "C";

  return (
    <article className="overflow-hidden rounded-[28px] border border-[#D8EBDD] bg-white shadow-[0_18px_40px_rgba(31,51,40,0.08)]">
      <div className="border-b border-[#D8EBDD] bg-[linear-gradient(135deg,#F6FCF7_0%,#EAF6EC_72%,#FFFFFF_100%)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DDF4E5] text-lg font-bold text-[#247A4D] shadow-[0_10px_20px_rgba(63,166,107,0.15)]">
              {initial}
            </div>
            <div className="min-w-0 space-y-2">
              <h3 className="text-xl font-bold text-[#1F3328]">{customer.nombre}</h3>
              <div className="flex flex-wrap gap-2">
                <ClientPill label={`${customer.pedidos} pedido(s)`} tone="neutral" />
                <ClientPill
                  label={customer.pendiente > 0 ? "Fiado pendiente" : "Sin deuda"}
                  tone={customer.pendiente > 0 ? "danger" : "success"}
                />
                {customer.isRecent ? <ClientPill label="Reciente" tone="accent" /> : null}
              </div>
            </div>
          </div>
          <span className="rounded-full border border-[#D8EBDD] bg-white px-3 py-1 text-xs font-semibold text-[#247A4D]">
            {formatDateOnly(customer.ultimoMovimiento.slice(0, 10))}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <ClientFact icon={Phone} label="Teléfono" value={customer.telefono || "Sin teléfono"} />
          <ClientFact
            icon={Store}
            label="Unidad"
            value={customer.lugarTrabajo || "Sin unidad"}
          />
          <ClientFact
            icon={ReceiptText}
            label="Total comprado"
            value={formatCurrency(customer.totalComprado)}
          />
          <ClientFact
            icon={HandCoins}
            label="Deuda pendiente"
            value={customer.pendiente > 0 ? formatCurrency(customer.pendiente) : "Sin deuda"}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MiniMetric label="Pedidos activos" value={String(customer.pedidosActivos)} />
          <MiniMetric label="Pedidos cerrados" value={String(customer.pedidosFinalizados)} />
          <MiniMetric label="Último pedido" value={formatShortDateTime(customer.ultimoMovimiento)} />
        </div>

        <div className="rounded-[22px] border border-[#D8EBDD] bg-[#F6FCF7] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#247A4D]">
            Fechas agendadas
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {customer.proximasFechas.length === 0 ? (
              <span className="text-sm text-[#6B7C70]">Sin pedidos agendados por ahora</span>
            ) : (
              customer.proximasFechas.slice(0, 4).map((fecha) => (
                <span
                  key={`${customer.clienteId}-${fecha}`}
                  className="rounded-full border border-[#D8EBDD] bg-white px-3 py-1 text-xs font-semibold text-[#247A4D]"
                >
                  {formatDateOnly(fecha)}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenOrders}
            className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-[#3FA66B] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(63,166,107,0.2)]"
          >
            Ver pedidos
          </button>
          <button
            type="button"
            onClick={onOpenPayments}
            className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-[#D8EBDD] bg-[#F6FCF7] px-4 py-3 text-sm font-semibold text-[#247A4D]"
          >
            Revisar cobros
          </button>
        </div>
      </div>
    </article>
  );
}

function ClientFact({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#D8EBDD] bg-[#F6FCF7] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#247A4D]">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold leading-6 text-[#1F3328]">{value}</div>
    </div>
  );
}

function ClientPill({
  label,
  tone
}: {
  label: string;
  tone: "neutral" | "success" | "danger" | "accent";
}) {
  const className =
    tone === "success"
      ? "border-[#D8EBDD] bg-[#DDF4E5] text-[#247A4D]"
      : tone === "danger"
        ? "border-[#F5C0BB] bg-[#FFF0EF] text-[#D66D63]"
        : tone === "accent"
          ? "border-[#F0E2AA] bg-[#FFF8DE] text-[#8A6A14]"
          : "border-[#D8EBDD] bg-white text-[#247A4D]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function ClientEmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#D8EBDD] bg-[#F3FAF4] p-8 text-center shadow-soft">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#247A4D] shadow-[0_12px_24px_rgba(31,51,40,0.08)]">
        <UserRound className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-xl font-bold text-[#1F3328]">
        {hasSearch ? "No encontramos coincidencias." : "Aún no hay clientes registrados."}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6B7C70]">
        {hasSearch
          ? "Prueba con otro nombre, teléfono o lugar de trabajo para seguir buscando."
          : "Cuando ingresen pedidos, aparecerán aquí automáticamente."}
      </p>
    </div>
  );
}

function InlineField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="text-sm font-semibold text-emerald-900">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      />
    </label>
  );
}

function InlineSelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="min-w-0 space-y-2">
      <span className="text-sm font-semibold text-emerald-900">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuickStockAdjuster({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const currentValue = normalizeStockValue(value);

  return (
    <div className="min-w-0 space-y-2">
      <span className="text-sm font-semibold text-emerald-900">Ajuste Rápido</span>
      <div className="grid grid-cols-4 gap-2">
        {[-1, 1, 5, 10].map((delta) => (
          <button
            key={delta}
            type="button"
            onClick={() => onChange(String(Math.max(0, currentValue + delta)))}
            className="min-h-11 rounded-lg border border-emerald-100 bg-white px-2 text-sm font-semibold text-emerald-900"
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[72px] flex-col justify-center rounded-[18px] border border-emerald-100 bg-white px-3 py-3">
      <div className="text-[11px] uppercase tracking-wide text-emerald-700/70">{label}</div>
      <div className="mt-1 text-sm font-semibold text-emerald-950">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-emerald-100 bg-emerald-50/50 p-4 text-sm text-emerald-900/60">
      {text}
    </div>
  );
}

function StatusBadge({
  tone,
  label
}: {
  tone: "pedido" | "warning" | "neutral";
  label: string;
}) {
  const classes =
    tone === "pedido"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "warning"
        ? "bg-amber-100 text-amber-800"
        : "bg-violet-100 text-violet-800";

  return (
    <span
      className={`inline-flex min-h-8 max-w-full items-center justify-center rounded-full px-3 py-1 text-center text-xs font-semibold leading-4 ${classes}`}
    >
      {label}
    </span>
  );
}

function BadgeStatusChip({
  badgeEnabled,
  badgeSupported,
  notificationPermission,
  isInstalledPwa,
  onClick,
  pendingCount
}: {
  badgeEnabled: boolean;
  badgeSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  isInstalledPwa: boolean;
  onClick?: () => void;
  pendingCount?: number;
}) {
  const label = badgeEnabled
    ? "Badge activo"
    : !badgeSupported
      ? "No compatible"
      : notificationPermission === "denied"
        ? "Permiso denegado"
        : !isInstalledPwa
          ? "Abrir desde inicio"
          : "Por activar";
  const className = badgeEnabled
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : !badgeSupported || notificationPermission === "denied"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-violet-200 bg-violet-50 text-violet-800";
  const indicatorClassName = badgeEnabled
    ? "bg-emerald-500"
    : !badgeSupported || notificationPermission === "denied"
      ? "bg-amber-500"
      : "bg-violet-500";
  const content = (
    <>
      <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-white/80 p-[2px]">
        <span className={`block h-full w-full rounded-full ${indicatorClassName}`} />
      </span>
      {typeof pendingCount === "number" && pendingCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      ) : null}
      <Bell className="h-5 w-5" />
      <span className="sr-only">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className={`relative inline-flex h-12 w-12 items-center justify-center rounded-[18px] border transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)] ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      title={label}
      aria-label={label}
      className={`relative inline-flex h-12 w-12 items-center justify-center rounded-[18px] border ${className}`}
    >
      {content}
    </span>
  );
}

function HeaderIconButton({
  label,
  title,
  onClick,
  icon,
  disabled,
  accent = "default"
}: {
  label: string;
  title: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  accent?: "default" | "soft";
}) {
  const className =
    accent === "soft"
      ? "border-emerald-100 bg-emerald-50 text-emerald-900"
      : "border-emerald-100 bg-white text-emerald-900";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-[18px] border transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(16,24,40,0.08)] disabled:cursor-not-allowed disabled:bg-emerald-50 disabled:text-emerald-500 ${className}`}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function formatBadgePermission(value: NotificationPermission | "unsupported") {
  if (value === "granted") {
    return "Permitido";
  }

  if (value === "denied") {
    return "Denegado";
  }

  if (value === "default") {
    return "Pendiente";
  }

  return "Sin soporte";
}

function resolveBadgeActivationErrorMessage(error: string | null) {
  if (error === "BADGE_NOT_SUPPORTED") {
    return "Este navegador no soporta badge en el icono.";
  }

  if (error === "NOTIFICATION_PERMISSION_DENIED") {
    return "El permiso fue denegado. Debes activarlo desde Ajustes del iPhone para esta app.";
  }

  return "No se pudo activar el badge. Revisa permisos de notificaciones del iPhone o vuelve a abrir la app desde el icono instalado.";
}

function getCurrentDeviceLabel() {
  if (typeof navigator === "undefined") {
    return "Dispositivo";
  }

  const platform = navigator.platform?.trim();
  return platform ? `iPhone/${platform}` : "iPhone";
}

function MobileQuickHomeButton({
  href,
  label
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-100 bg-white/95 text-emerald-900 shadow-soft backdrop-blur md:hidden"
      aria-label={label}
      title={label}
    >
      <Home className="h-4 w-4" />
    </Link>
  );
}

function mergeOrderItems(
  current: Array<{ name: string; quantity: number }>,
  incoming: Array<{ name: string; quantity: number }>
) {
  const grouped = new Map<string, number>();

  [...current, ...incoming].forEach((item) => {
    grouped.set(item.name, (grouped.get(item.name) ?? 0) + item.quantity);
  });

  return Array.from(grouped.entries()).map(([name, quantity]) => ({ name, quantity }));
}

function renderGroupedItemLines(
  items: Array<{ name: string; quantity: number }>,
  visibleLimit = 3
) {
  const grouped = mergeOrderItems([], items);
  const visibleLines = grouped
    .slice(0, visibleLimit)
    .map((item) => `- ${item.quantity} x ${item.name}`);

  if (grouped.length > visibleLimit) {
    visibleLines.push(`+ ${grouped.length - visibleLimit} producto(s) mas`);
  }

  return visibleLines;
}

function agruparFiadosPorCliente(fiados: AdminOrderSummary[] = []) {
  const groups = new Map<string, GroupedFiadoCustomer>();

  fiados.forEach((fiado) => {
    const clienteId = findGroupedFiadoKey(groups, fiado);

    if (!clienteId) {
      return;
    }

    const current = groups.get(clienteId) ?? {
      clienteId,
      nombre: fiado.clienteNombre || "Cliente sin nombre",
      telefono: fiado.clienteTelefono || "",
      lugarTrabajo: fiado.clienteLugarTrabajo || "",
      totalPendiente: 0,
      cantidadFiados: 0,
      fiados: []
    };

    if (shouldReplaceGroupedCustomerData(current, fiado)) {
      current.clienteId = fiado.clienteId || current.clienteId;
      current.nombre = fiado.clienteNombre || current.nombre;
      current.telefono = fiado.clienteTelefono || current.telefono;
      current.lugarTrabajo = pickBetterWorkplace(current.lugarTrabajo, fiado.clienteLugarTrabajo);
    } else if (!current.lugarTrabajo) {
      current.lugarTrabajo = fiado.clienteLugarTrabajo || current.lugarTrabajo;
    }

    current.totalPendiente += Number(fiado.saldoPendiente || 0);
    current.cantidadFiados += 1;
    current.fiados.push(fiado);

    groups.set(clienteId, current);
  });

  return Array.from(groups.values())
    .map((customer) => ({
      ...customer,
      fiados: [...customer.fiados].sort((a, b) =>
        getFiadoDateValue(b).localeCompare(getFiadoDateValue(a))
      )
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function findGroupedFiadoKey(
  groups: Map<string, GroupedFiadoCustomer>,
  fiado: AdminOrderSummary
) {
  const normalizedPhone = fiado.clienteTelefono.replace(/\D/g, "");
  const normalizedName = normalizeIdentityValue(fiado.clienteNombre);
  const normalizedWorkplace = normalizeIdentityValue(fiado.clienteLugarTrabajo);

  if (normalizedPhone) {
    const phoneMatch = Array.from(groups.entries()).find(([, customer]) => {
      return customer.telefono.replace(/\D/g, "") === normalizedPhone;
    });

    if (phoneMatch) {
      return phoneMatch[0];
    }
  }

  const nameMatch = Array.from(groups.entries()).find(([, customer]) => {
    const sameName = normalizeIdentityValue(customer.nombre) === normalizedName;

    if (!sameName) {
      return false;
    }

    const customerWorkplace = normalizeIdentityValue(customer.lugarTrabajo);
    const workplacesCompatible =
      !normalizedWorkplace ||
      !customerWorkplace ||
      normalizedWorkplace === customerWorkplace ||
      isWeakCustomerWorkplace(normalizedWorkplace) ||
      isWeakCustomerWorkplace(customerWorkplace);
    const phoneCompatible =
      !normalizedPhone || !customer.telefono || customer.telefono.replace(/\D/g, "") === normalizedPhone;

    return workplacesCompatible && phoneCompatible;
  });

  if (nameMatch) {
    return nameMatch[0];
  }

  return fiado.clienteId || buildCustomerIdentityKey(fiado);
}

function isWeakCustomerWorkplace(value: string) {
  return (
    value === "" ||
    value === "venta directa" ||
    value === "venta whatsapp manual" ||
    value === "pedido personalizado"
  );
}

function pickBetterWorkplace(currentValue: string, incomingValue: string) {
  const current = currentValue || "";
  const incoming = incomingValue || "";

  if (!current) {
    return incoming;
  }

  if (!incoming) {
    return current;
  }

  const currentWeak = isWeakCustomerWorkplace(normalizeIdentityValue(current));
  const incomingWeak = isWeakCustomerWorkplace(normalizeIdentityValue(incoming));

  if (currentWeak && !incomingWeak) {
    return incoming;
  }

  if (!currentWeak && incomingWeak) {
    return current;
  }

  return incoming.length > current.length ? incoming : current;
}

function shouldReplaceGroupedCustomerData(
  current: GroupedFiadoCustomer,
  fiado: AdminOrderSummary
) {
  const currentScore =
    Number(Boolean(current.telefono)) * 4 +
    Number(!isWeakCustomerWorkplace(normalizeIdentityValue(current.lugarTrabajo || ""))) * 2 +
    Number(Boolean(current.lugarTrabajo)) +
    Number(Boolean(current.nombre));
  const incomingScore =
    Number(Boolean(fiado.clienteTelefono)) * 4 +
    Number(
      !isWeakCustomerWorkplace(normalizeIdentityValue(fiado.clienteLugarTrabajo || ""))
    ) *
      2 +
    Number(Boolean(fiado.clienteLugarTrabajo)) +
    Number(Boolean(fiado.clienteNombre));

  return incomingScore > currentScore;
}

function getFiadoDateValue(order: AdminOrderSummary) {
  return order.fechaFiado || order.fechaPedido || order.fechaAgendado || "";
}

function formatFiadoDate(order: AdminOrderSummary) {
  const value = getFiadoDateValue(order);
  return value ? formatDateOnly(value) : "Sin fecha";
}

function getLastDebtPaymentDate(orders: AdminOrderSummary[]) {
  return orders
    .map((order) => order.fechaUltimoPago)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0];
}

function getGroupedDebtCollectionAction(customer: GroupedFiadoCustomer) {
  const normalizedPhone = parseChileanMobilePhone(customer.telefono);

  if (!normalizedPhone) {
    return null;
  }

  const total = formatCurrency(customer.totalPendiente);
  const detail = customer.fiados
    .map((fiado) => {
      const items = fiado.items.length
        ? fiado.items
            .map((item) => {
              return `  (${item.cantidad} ${item.productoNombre})`;
            })
            .join("\n")
        : "  (Pedido registrado)";

      return `- ${formatCurrency(fiado.saldoPendiente)} del ${formatFiadoDate(fiado)}\n${items}`;
    })
    .join("\n\n");

  return buildWhatsAppManualUrl(
    normalizedPhone.e164.replace(/\D/g, ""),
    buildGroupedDebtCollectionMessage(customer.nombre, total, detail)
  );

  void [
    "Buenas tardes! ☀️",
    "",
    "Muchas gracias por preferirme esta semana para acompanar sus desayunos 💛",
    "Le envio el detalle de su cuenta:",
    "",
    `✨Monto total: ${total}`,
    "📝Detalle:",
    detail,
    "",
    "Le dejo mis datos para transferencia.",
    "",
    "Muchas gracias nuevamente! 🤗",
    "",
    paymentInfo.accountHolder,
    paymentInfo.rut,
    paymentInfo.bank,
    paymentInfo.accountType,
    paymentInfo.accountNumber,
    paymentInfo.email
  ].join("\n");

  return "";
}

function getDebtCollectionAction(order: AdminOrderSummary) {
  if (
    order.saldoPendiente <= 0 &&
    order.estadoPago !== "FIADO" &&
    order.estadoPago !== "SIN_PAGO"
  ) {
    return null;
  }

  const notification = notificationService.prepareOrderConfirmationNotification({
    customerName: order.clienteNombre,
    customerPhone: order.clienteTelefono,
    items: order.items.map((item) => ({
      name: item.productoNombre,
      quantity: item.cantidad
    }))
  });

  if (notification.status !== "ready" || !order.clienteTelefono) {
    return null;
  }

  const normalizedPhone = parseChileanMobilePhone(order.clienteTelefono);

  if (!normalizedPhone) {
    return null;
  }

  return buildWhatsAppManualUrl(
    normalizedPhone.e164.replace(/\D/g, ""),
    buildDebtCollectionMessage({
      customerName: order.clienteNombre,
      amount: order.saldoPendiente > 0 ? order.saldoPendiente : order.total,
      items: order.items.map((item) => ({
        name: item.productoNombre,
        quantity: item.cantidad
      }))
    })
  );
}

function waSunEmoji() {
  return String.fromCodePoint(0x2600, 0xfe0f);
}

function waHeartEmoji() {
  return String.fromCodePoint(0x1f49b);
}

function waSparklesEmoji() {
  return String.fromCodePoint(0x2728);
}

function waMemoEmoji() {
  return String.fromCodePoint(0x1f4dd);
}

function waHugEmoji() {
  return String.fromCodePoint(0x1f917);
}

function buildGroupedDebtCollectionMessage(name: string, total: string, detail: string) {
  return [
    `Buenas tardes! ${waSunEmoji()}`,
    "",
    `Hola ${name},`,
    "",
    `Muchas gracias por preferirme esta semana para acompa\u00F1ar sus desayunos ${waHeartEmoji()}`,
    "Le env\u00EDo el detalle de su cuenta:",
    "",
    `${waSparklesEmoji()}Monto total: ${total}`,
    `${waMemoEmoji()}Detalle:`,
    detail,
    "",
    "Le dejo mis datos para transferencia.",
    "",
    `¡Muchas gracias nuevamente! ${waHugEmoji()}`,
    "",
    paymentInfo.accountHolder,
    paymentInfo.rut,
    paymentInfo.bank,
    paymentInfo.accountType,
    paymentInfo.accountNumber,
    paymentInfo.email
  ].join("\n");
}

function getNewOrderAdminWhatsAppUrl(order: AdminOrderSummary) {
  return buildWhatsAppShareUrl(
    buildAdminOrderAlertMessage({
      customerName: order.clienteNombre,
      deliveryDateLabel: order.fechaEntrega
        ? formatDateOnly(order.fechaEntrega)
        : "Por coordinar",
      total: order.total,
      items: order.items.map((item) => ({
        name: item.productoNombre,
        quantity: item.cantidad
      }))
    })
  );
}

function formatShortDateTime(value: string) {
  return formatChileDateTime(value);
}

function shouldShowOrderWhatsAppAction(order: AdminOrderSummary) {
  return order.estadoPedido === "AGENDADO" || order.estadoPedido === "FINALIZADO";
}

function getOrderWhatsAppNotification(
  order: AdminOrderSummary,
  deliveryDateValue?: string
) {
  return notificationService.prepareOrderConfirmationNotification({
    customerName: order.clienteNombre,
    customerPhone: order.clienteTelefono,
    items: order.items.map((item) => ({
      name: item.productoNombre,
      quantity: item.cantidad
    })),
    total: order.total,
    deliveryDateLabel: deliveryDateValue
      ? formatDateOnly(deliveryDateValue)
      : order.fechaEntrega
        ? formatDateOnly(order.fechaEntrega)
        : "Por coordinar"
  });
}

function buildScheduledOrderMessage(
  order: AdminOrderSummary,
  deliveryDateValue?: string
) {
  return buildOrderConfirmationMessage({
    customerName: order.clienteNombre,
    items: order.items.map((item) => ({
      name: item.productoNombre,
      quantity: item.cantidad
    })),
    total: order.total,
    deliveryDateLabel: deliveryDateValue
      ? formatDateOnly(deliveryDateValue)
      : order.fechaEntrega
        ? formatDateOnly(order.fechaEntrega)
        : "Por coordinar"
  });
}

function openWhatsAppSafe(phone: string, message: string) {
  const normalizedPhone = normalizeChilePhone(phone ?? "");

  if (!normalizedPhone) {
    return {
      status: "invalid-phone" as const,
      error: phone?.trim() ? "Telefono invalido" : "Sin telefono"
    };
  }

  const url = buildWhatsAppManualUrl(normalizedPhone, message);
  const opened = window.open(url, "_blank", "noopener,noreferrer");

  if (!opened) {
    return {
      status: "blocked" as const,
      url
    };
  }

  return {
    status: "opened" as const,
    url
  };
}

function getCurrentMonthRange(reference = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = formatLocalDateInput(new Date(year, month, 1));
  const to = formatLocalDateInput(new Date(year, month + 1, 0));

  return { from, to };
}

function getReportRangePresetValues(preset: Exclude<ReportRangePreset, "custom">) {
  const today = new Date();

  if (preset === "today") {
    const value = getChileTodayInputValue(today);
    return { from: value, to: value };
  }

  if (preset === "week") {
    const current = new Date(today);
    const day = current.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    current.setDate(current.getDate() - diffToMonday);
    const from = formatLocalDateInput(current);
    const to = getChileTodayInputValue(today);
    return { from, to };
  }

  if (preset === "last-month") {
    const year = today.getFullYear();
    const month = today.getMonth();
    return {
      from: formatLocalDateInput(new Date(year, month - 1, 1)),
      to: formatLocalDateInput(new Date(year, month, 0))
    };
  }

  return getCurrentMonthRange(today);
}

function formatLocalDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }

  return `${value.toFixed(1)}%`;
}

function mapOrderOriginToReportFilter(origin?: string): ReportSalesFilter {
  if (origin === "ADMIN_DIRECTO") {
    return "venta-directa";
  }

  if (origin === "PERSONALIZADO") {
    return "venta-personalizada";
  }

  return "pedido-cliente";
}

function getSalesFilterLabel(value: ReportSalesFilter) {
  if (value === "venta-directa") {
    return "Ventas directas";
  }

  if (value === "venta-personalizada") {
    return "Ventas personalizadas";
  }

  if (value === "pedido-cliente") {
    return "Pedidos cliente";
  }

  return "Todos";
}

function getOrderItemProfitabilityStatus(
  order: AdminOrderSummary,
  item: AdminOrderSummary["items"][number]
): ProfitabilityCostStatus {
  const hasCost = (item.costoTotal ?? item.costoUnitario ?? 0) > 0;

  if (!hasCost) {
    return "missing";
  }

  if (order.origenPedido === "PERSONALIZADO" && !item.productoId) {
    return "estimated";
  }

  return "ok";
}

function formatDateOnly(value: string) {
  return formatChileDateOnly(value);
}

function normalizeIdentityValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildCustomerIdentityKey(order: {
  clienteNombre: string;
  clienteTelefono: string;
  clienteLugarTrabajo: string;
}) {
  const normalizedPhone = order.clienteTelefono.replace(/\D/g, "");

  if (normalizedPhone) {
    return normalizedPhone;
  }

  return [
    normalizeIdentityValue(order.clienteNombre),
    normalizeIdentityValue(order.clienteLugarTrabajo)
  ].join("__");
}

function isRecentCustomerMovement(value: string) {
  const movementDate = new Date(value);

  if (Number.isNaN(movementDate.getTime())) {
    return false;
  }

  const diffInDays = (Date.now() - movementDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffInDays <= 14;
}

function todayDateValue() {
  return getChileTodayInputValue();
}

function buttonToneClass(tone: "primary" | "warning" | "muted") {
  if (tone === "primary") {
    return "inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm";
  }

  if (tone === "warning") {
    return "inline-flex min-h-11 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800";
  }

  return "inline-flex min-h-11 items-center rounded-xl border border-emerald-100 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900";
}

function StableHorizontalRail({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const lastScrollLeftRef = useRef(0);

  useEffect(() => {
    const rail = railRef.current;

    if (!rail) {
      return;
    }

    if (Math.abs(rail.scrollLeft - lastScrollLeftRef.current) > 1) {
      rail.scrollLeft = lastScrollLeftRef.current;
    }
  });

  return (
    <div
      ref={railRef}
      onScroll={(event) => {
        lastScrollLeftRef.current = event.currentTarget.scrollLeft;
      }}
      className={className}
    >
      {children}
    </div>
  );
}
