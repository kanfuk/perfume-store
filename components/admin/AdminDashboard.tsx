"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  BarChart3,
  Box,
  Boxes,
  CalendarClock,
  CalendarRange,
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  HandCoins,
  MessageCircle,
  Phone,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings,
  Sparkles,
  Store,
  UserRound,
  WalletCards
} from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { AdminNotificationBadge } from "@/components/admin/AdminNotificationBadge";
import { WhatsAppFloatingButton } from "@/components/shared/WhatsAppFloatingButton";
import {
  ADMIN_VIEW_META,
  ADMIN_VIEW_ROUTES,
  PENDING_ORDERS_REFRESH_MS,
  PENDING_ORDERS_SECTION_ID,
  SCHEDULED_ORDERS_SECTION_ID,
  reportRangeOptions,
  reportSalesOptions,
  statusOptions
} from "@/components/admin/dashboard/admin-dashboard.constants";
import type {
  AdminDashboardProps,
  AdminView,
  CustomerCardData,
  CustomerEditModalState,
  CustomerFilter,
  GroupedFiadoCustomer,
  OrderModalState,
  OrderSectionProps,
  ProfitabilityCostStatus,
  ReportRangePreset,
  ReportSalesFilter,
  ReportTab,
  StatusFilter,
  WhatsAppFallbackState
} from "@/components/admin/dashboard/admin-dashboard.types";
import {
  agruparFiadosPorCliente,
  buildCustomerIdentityKey,
  buttonToneClass,
  formatDateOnly,
  formatFiadoDate,
  formatPercent,
  formatShortDateTime,
  getCostStatusLabel,
  getCurrentDeviceLabel,
  getLastDebtPaymentDate,
  getReportRangePresetValues,
  getSalesFilterLabel,
  isRecentCustomerMovement,
  mapOrderOriginToReportFilter,
  mergeOrderItems,
  renderGroupedItemLines,
  resolveBadgeActivationErrorMessage,
  resolveOrderItemProfitabilityCost,
  todayDateValue
} from "@/components/admin/dashboard/admin-dashboard.utils";
import {
  BadgeStatusChip,
  CompactHistorySection,
  CompactSelect,
  CostStatusBadge,
  EmptyState,
  HeaderIconButton,
  HeroMetric,
  MiniHomeTab,
  MiniMetric,
  ProfitabilityBar,
  ReportDateField,
  SectionIntro,
  SegmentedControl,
  StatusBadge
} from "@/components/admin/dashboard/DashboardPresentation";
import { DashboardHomeView } from "@/components/admin/dashboard/DashboardHomeView";
import { AdminNav } from "@/components/admin/dashboard/AdminNav";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import { formatChileanMobileInput, parseChileanMobilePhone } from "@/lib/chile-phone";
import {
  getNewAdminOrders,
  getNewAdminOrdersCount
} from "@/lib/admin/getPendingAdminOrders";
import {
  ESTADO_PAGO_LABELS,
  ESTADO_PEDIDO_LABELS,
  METODO_DESPACHO_LABELS,
  type EstadoPago,
  type EstadoPedido,
  type MetodoDespacho
} from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { copyTextWithFallback } from "@/lib/clipboard";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
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
import { getUnifiedProductStock } from "@/lib/stock";
import {
  feedbackMessages,
  getMaintenanceConfirmationMessage
} from "@/lib/ui/feedback-messages";
import { buildAdminOrderAlertMessage } from "@/lib/whatsapp/buildAdminOrderAlertMessage";
import { buildDebtCollectionMessage } from "@/lib/whatsapp/buildDebtCollectionMessage";
import { buildWhatsAppManualUrl } from "@/lib/whatsapp/buildWhatsAppManualUrl";
import { buildWhatsAppShareUrl } from "@/lib/whatsapp/buildWhatsAppShareUrl";
import { createWhatsAppActionState } from "@/lib/whatsapp/action";
import { createNotificationService } from "@/services/NotificationService";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getChileCurrentMonthRange, getChileCurrentWeekRange } from "@/lib/date";
import type {
  AdminCustomerOption,
  AdminMaintenanceAction,
  AdminBadgeDeviceSetting,
  AdminDashboardData,
  AdminOrderSummary,
  AdminOrdersAction,
  AdminProductRecord
} from "@/lib/types";

const notificationService = createNotificationService();

export function AdminDashboard({
  initialData,
  initialView = "home",
  initialCustomers = []
}: AdminDashboardProps) {
  const feedback = useAppFeedback();
  const router = useRouter();
  const refreshOrdersInFlightRef = useRef<Promise<void> | null>(null);
  const refreshRetryTimeoutRef = useRef<number | null>(null);
  const orderActionsInFlightRef = useRef(new Set<string>());
  const [data, setData] = useState<AdminDashboardData>(initialData.dashboard);
  const [products, setProducts] = useState<AdminProductRecord[]>(initialData.productos);
  const [customers, setCustomers] = useState<AdminCustomerOption[]>(initialCustomers);
  const [view, setView] = useState<AdminView>(initialView);
  const [loading, setLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [whatsAppFallback, setWhatsAppFallback] = useState<WhatsAppFallbackState | null>(null);
  const [paymentSettingsComplete, setPaymentSettingsComplete] = useState<boolean | null>(
    null
  );
  const [busyOrderId, setBusyOrderId] = useState("");
  const [busyMaintenanceAction, setBusyMaintenanceAction] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendientes");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("todos");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [orderModalState, setOrderModalState] = useState<OrderModalState>(null);
  const [customerEditModalState, setCustomerEditModalState] =
    useState<CustomerEditModalState>(null);
  const [customerSaveLoading, setCustomerSaveLoading] = useState(false);
  const [reportTab, setReportTab] = useState<ReportTab>("rentabilidad");
  const [reportRangePreset, setReportRangePreset] = useState<ReportRangePreset>("month");
  const [reportSalesFilter, setReportSalesFilter] = useState<ReportSalesFilter>("todos");
  const [reportFrom, setReportFrom] = useState(() => getChileCurrentMonthRange().from);
  const [reportTo, setReportTo] = useState(() => getChileCurrentMonthRange().to);
  const [todayDate, setTodayDate] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  useEffect(() => {
    if (!whatsAppFallback) return;
    const originalOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWhatsAppFallback(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [whatsAppFallback]);
  const badgeDeviceId = useSyncExternalStore(
    subscribeToClientSnapshot,
    getOrCreateDeviceId,
    getEmptyClientSnapshot
  );
  const [badgeDeviceSetting, setBadgeDeviceSetting] = useState<AdminBadgeDeviceSetting | null>(
    null
  );
  const [badgeCardLoading, setBadgeCardLoading] = useState(false);
  const [badgeActionLoading, setBadgeActionLoading] = useState(false);
  const isInstalledPwa = useSyncExternalStore(
    subscribeToClientSnapshot,
    isRunningAsInstalledPwa,
    getFalseClientSnapshot
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPaymentSettingsStatus() {
      try {
        const response = await fetch("/api/admin/settings/payment?summary=1", {
          cache: "no-store"
        });
        const payload = (await response.json()) as {
          completa?: boolean;
        };

        if (!cancelled && response.ok) {
          setPaymentSettingsComplete(payload.completa === true);
        }
      } catch {
        if (!cancelled) {
          setPaymentSettingsComplete(null);
        }
      }
    }

    void loadPaymentSettingsStatus();

    return () => {
      cancelled = true;
    };
  }, []);
  const badgeSupported = useSyncExternalStore(
    subscribeToClientSnapshot,
    isAppBadgeSupported,
    getFalseClientSnapshot
  );
  const pushSupported = useSyncExternalStore(
    subscribeToClientSnapshot,
    isPushNotificationsSupported,
    getFalseClientSnapshot
  );
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
    const stockCritico = productosActivos.filter(
      (product) => getUnifiedProductStock(product) <= (product.stockMinimo || 1)
    ).length;

    return {
      pendientes: data.pendientes.length,
      agendaHoy: agendaHoy.length,
      productosActivos: productosActivos.length,
      stockTotal,
      stockCritico
    };
  }, [data, products, todayDate]);

  /**
   * Ventas de la semana (lunes a domingo actual), independiente del rango
   * que el admin haya elegido en la pestaña Reportes: la tarjeta del
   * dashboard siempre debe leerse como "esta semana", sin depender de un
   * filtro que el usuario pudo haber cambiado en otra pestaña.
   */
  const weekSalesTotal = useMemo(() => {
    const { from, to } = getChileCurrentWeekRange();
    return data.finalizados.reduce((sum, order) => {
      const baseDate = order.fechaEntrega ?? order.fechaPago ?? order.fechaPedido;
      const dateOnly = baseDate.slice(0, 10);
      if (dateOnly < from || dateOnly > to) return sum;
      return sum + order.total;
    }, 0);
  }, [data.finalizados]);

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
    const metricsByCustomerId = new Map<
      string,
      Omit<CustomerCardData, "nombre" | "telefono" | "lugarTrabajo" | "isRecent">
    >();

    allOrders.forEach((order) => {
      const current = metricsByCustomerId.get(order.clienteId) ?? {
        clienteId: order.clienteId,
        pedidos: 0,
        pendiente: 0,
        totalComprado: 0,
        ultimoMovimiento: order.fechaPedido,
        proximasFechas: [],
        pedidosActivos: 0,
        pedidosFinalizados: 0
      };

      current.pedidos += 1;
      current.pendiente += order.saldoPendiente;
      current.totalComprado += order.total;
      current.pedidosActivos +=
        order.estadoPedido === "NUEVO" || order.estadoPedido === "AGENDADO" ? 1 : 0;
      current.pedidosFinalizados +=
        order.estadoPedido === "PAGADO" ||
        order.estadoPedido === "PREPARANDO" ||
        order.estadoPedido === "DESPACHADO" ||
        order.estadoPedido === "ENTREGADO"
          ? 1
          : 0;
      current.ultimoMovimiento =
        current.ultimoMovimiento > order.fechaPedido
          ? current.ultimoMovimiento
          : order.fechaPedido;

      if (order.fechaEntrega && !current.proximasFechas.includes(order.fechaEntrega)) {
        current.proximasFechas.push(order.fechaEntrega);
      }

      metricsByCustomerId.set(order.clienteId, current);
    });

    const cards = customers.map((customer) => {
      const metrics = metricsByCustomerId.get(customer.id);
      metricsByCustomerId.delete(customer.id);

      return {
        clienteId: customer.id,
        nombre: customer.nombre,
        telefono: customer.telefono,
        lugarTrabajo: customer.lugarTrabajo,
        pedidos: metrics?.pedidos ?? 0,
        pendiente: metrics?.pendiente ?? 0,
        totalComprado: metrics?.totalComprado ?? 0,
        ultimoMovimiento: metrics?.ultimoMovimiento ?? "",
        proximasFechas: [...(metrics?.proximasFechas ?? [])].sort((a, b) => a.localeCompare(b)),
        pedidosActivos: metrics?.pedidosActivos ?? 0,
        pedidosFinalizados: metrics?.pedidosFinalizados ?? 0,
        isRecent: metrics ? isRecentCustomerMovement(metrics.ultimoMovimiento) : false
      };
    });

    metricsByCustomerId.forEach((metrics, customerId) => {
      const fallbackOrder = allOrders.find((order) => order.clienteId === customerId);

      if (!fallbackOrder) {
        return;
      }

      cards.push({
        clienteId: customerId,
        nombre: fallbackOrder.clienteNombre,
        telefono: fallbackOrder.clienteTelefono,
        lugarTrabajo: fallbackOrder.clienteLugarTrabajo,
        pedidos: metrics.pedidos,
        pendiente: metrics.pendiente,
        totalComprado: metrics.totalComprado,
        ultimoMovimiento: metrics.ultimoMovimiento,
        proximasFechas: [...metrics.proximasFechas].sort((a, b) => a.localeCompare(b)),
        pedidosActivos: metrics.pedidosActivos,
        pedidosFinalizados: metrics.pedidosFinalizados,
        isRecent: isRecentCustomerMovement(metrics.ultimoMovimiento)
      });
    });

    return cards.sort((a, b) => b.ultimoMovimiento.localeCompare(a.ultimoMovimiento));
  }, [allOrders, customers]);

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
      const baseDate = order.fechaEntrega ?? order.fechaPago ?? order.fechaPedido;
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
        const productKey = item.productoId ?? `sin-producto:${item.productoNombre}`;
        const product = ventasPorProducto.get(productKey) ?? {
          nombre: item.productoNombre,
          unidades: 0,
          total: 0
        };
        product.unidades += item.cantidad;
        product.total += item.subtotal;
        ventasPorProducto.set(productKey, product);
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
        estimatedItems: number;
        missingItems: number;
        status: ProfitabilityCostStatus;
      }
    >();
    const estimatedCostProducts = new Map<
      string,
      {
        id: string;
        nombre: string;
        unidades: number;
        ventaTotal: number;
        costoTotal: number;
        utilidad: number;
      }
    >();

    let totalVentas = 0;
    let totalCostos = 0;
    let totalUtilidad = 0;
    let totalUnidades = 0;
    let estimatedItems = 0;
    let missingItems = 0;

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
          estimatedItems: 0,
          missingItems: 0,
          status: "real" as ProfitabilityCostStatus
        };

      origin.pedidos += 1;

      order.items.forEach((item, index) => {
        const resolvedCost = resolveOrderItemProfitabilityCost(item, products);
        const status = resolvedCost.status;
        const productKey = item.productoId || `${order.id}-${index}-${item.productoNombre}`;
        const product =
          byProduct.get(productKey) ?? {
            id: item.productoId || "",
            nombre: item.productoNombre,
            unidades: 0,
            ventaTotal: 0,
            costoTotal: 0,
            utilidad: 0,
            status
          };

        totalVentas += item.subtotal;
        totalUnidades += item.cantidad;
        origin.unidades += item.cantidad;
        origin.ventaTotal += item.subtotal;
        product.unidades += item.cantidad;
        product.ventaTotal += item.subtotal;

        if (status === "missing") {
          product.status = "missing";
          origin.missingItems += 1;
          origin.status = "missing";
          missingItems += 1;
        } else {
          totalCostos += resolvedCost.totalCost;
          totalUtilidad += resolvedCost.profit;
          origin.costoTotal += resolvedCost.totalCost;
          origin.utilidad += resolvedCost.profit;
          product.costoTotal += resolvedCost.totalCost;
          product.utilidad += resolvedCost.profit;

          if (status === "estimated") {
            estimatedItems += 1;
            origin.estimatedItems += 1;
            if (origin.status !== "missing") {
              origin.status = "estimated";
            }
            if (product.status !== "missing") {
              product.status = "estimated";
            }

            const estimatedProduct =
              estimatedCostProducts.get(productKey) ?? {
                id: item.productoId || "",
                nombre: item.productoNombre,
                unidades: 0,
                ventaTotal: 0,
                costoTotal: 0,
                utilidad: 0
              };
            estimatedProduct.unidades += item.cantidad;
            estimatedProduct.ventaTotal += item.subtotal;
            estimatedProduct.costoTotal += resolvedCost.totalCost;
            estimatedProduct.utilidad += resolvedCost.profit;
            estimatedCostProducts.set(productKey, estimatedProduct);
          } else if (product.status !== "missing") {
            product.status = "real";
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
      margenPromedio: totalVentas > 0 ? (totalUtilidad / totalVentas) * 100 : 0,
      totalPedidos: reportOrders.length,
      productosConCostoEstimado: Array.from(estimatedCostProducts.values()).sort(
        (a, b) => b.ventaTotal - a.ventaTotal
      ),
      totalProductosConCostoReal: Array.from(byProduct.values()).filter(
        (item) => item.status === "real"
      ).length,
      productosSinData: missingItems,
      totalProductosEstimados: estimatedCostProducts.size,
      totalItemsEstimados: estimatedItems,
      resumenPorTipo: Array.from(byOrigin.values())
        .map((item) => ({
          ...item,
          margen: item.ventaTotal > 0 ? (item.utilidad / item.ventaTotal) * 100 : 0
        }))
        .sort((a, b) => b.ventaTotal - a.ventaTotal),
      rentabilidadPorProducto: Array.from(byProduct.values())
        .map((item) => ({
          ...item,
          margen: item.ventaTotal > 0 ? (item.utilidad / item.ventaTotal) * 100 : null
        }))
        .sort((a, b) => b.ventaTotal - a.ventaTotal),
      topProductosPorUtilidad: Array.from(byProduct.values())
        .sort((a, b) => b.utilidad - a.utilidad)
        .slice(0, 5),
      topProductosPorVentas: Array.from(byProduct.values())
        .sort((a, b) => b.ventaTotal - a.ventaTotal)
        .slice(0, 5)
    };
  }, [products, reportOrders]);

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
          {
            key: "agendar" as const,
            label: "Atender y solicitar transferencia",
            tone: "primary" as const
          },
          {
            key: "pagado" as const,
            label: "Confirmar pago",
            tone: "muted" as const,
            disabled: true
          },
          {
            key: "cancelar" as const,
            label: "Cancelar pedido",
            tone: "muted" as const
          }
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
          { key: "pagado" as const, label: "Confirmar pago", tone: "primary" as const },
          {
            key: "reenviar-transferencia" as const,
            label: "Reenviar datos de pago",
            tone: "muted" as const
          },
          {
            key: "cancelar" as const,
            label: "Cancelar pedido",
            tone: "muted" as const
          }
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
    }
  }

  async function loadCustomers(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    try {
      if (!silent) {
        setCustomersLoading(true);
      }

      const response = await fetch("/api/admin/customers", { cache: "no-store" });
      const currentData = (await response.json()) as {
        customers?: AdminCustomerOption[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cargar clientes.");
      }

      setCustomers(currentData.customers ?? []);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cargar clientes."
      );
    } finally {
      if (!silent) {
        setCustomersLoading(false);
      }
    }
  }

  async function refreshAll() {
    setError("");
    await Promise.all([loadOrders(), loadProducts(), loadCustomers()]);
  }

  useEffect(() => {
    if (view !== "clientes" || customers.length > 0) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      void loadCustomers();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [customers.length, view]);

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
    const confirmed = await feedback.confirm({
      title: feedbackMessages.confirmMaintenanceTitle,
      description: getMaintenanceConfirmationMessage(action),
      confirmLabel: action === "close-month" ? "Cerrar mes" : "Limpiar datos",
      cancelLabel: "Cancelar",
      tone: "danger"
    });

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
      const copied = await copyTextWithFallback(
        whatsAppFallback.message,
        navigator.clipboard,
        document
      );
      if (!copied) throw new Error("copy-failed");
      setSuccessMessage("Mensaje copiado. Ya puedes pegarlo manualmente en WhatsApp.");
    } catch {
      setError(
        "No se pudo copiar el mensaje automaticamente. Copialo manualmente desde el recuadro."
      );
    }
  }

  function returnToWhatsAppOrder() {
    if (!whatsAppFallback) return;
    setView("agenda");
    setSelectedOrderId(whatsAppFallback.orderId);
    setStatusFilter(whatsAppFallback.action === "pagado" ? "historial" : "agendados");
    setWhatsAppFallback(null);
  }

  async function runAction(
    pedidoId: string,
    action: AdminOrdersAction,
    order?: AdminOrderSummary,
    payload?: {
      motivoCancelacion?: string;
      monto?: number;
      metodoPago?: string;
    }
    ) {
    const preparesWhatsApp = new Set<AdminOrdersAction>([
      "agendar",
      "reenviar-transferencia",
      "pagado",
      "coordinar-entrega"
    ]).has(action);
    const actionKey = `${pedidoId}:${action}`;
    if (orderActionsInFlightRef.current.has(actionKey)) return;
    orderActionsInFlightRef.current.add(actionKey);
    const normalizedPhone = order
      ? normalizeChilePhone(order.clienteTelefono ?? "")
      : null;

    try {
      setBusyOrderId(pedidoId);
      setError("");
      setSuccessMessage("");
      setWhatsAppFallback(null);
      const response = await fetchWithTimeout(`/api/admin/orders/${pedidoId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          ...payload
        })
      });

      const currentData = (await response.json()) as {
        error?: string;
        code?: string;
        configuracionUrl?: string;
        pedido?: AdminOrderSummary;
        whatsapp?: { message?: string };
      };

      if (!response.ok) {
        if (
          currentData.code === "CONFIG_INCOMPLETA" &&
          currentData.configuracionUrl
        ) {
          feedback.notify({
            message:
              currentData.error ??
              "Configura los datos bancarios antes de continuar.",
            tone: "warning",
            actionLabel: "Configurar ahora",
            onAction: () => router.push(currentData.configuracionUrl!)
          });
        }

        throw new Error(currentData.error ?? "No fue posible actualizar el pedido.");
      }

      setOrderModalState(null);
      if (action !== "reenviar-transferencia" && action !== "coordinar-entrega") {
        await loadOrders();
      }

      if (action === "agendar") {
        returnToOrdersListAfterSchedule();
      }

      if (action === "pagado") {
        setOrderModalState(null);
      }

      if (preparesWhatsApp && order && currentData.whatsapp?.message) {
        const message = currentData.whatsapp.message;
        const nextWhatsAppAction = createWhatsAppActionState({ message, phone: normalizedPhone, orderId: pedidoId, action });
        setWhatsAppFallback(nextWhatsAppAction);
        setSuccessMessage(
          nextWhatsAppAction?.url
            ? getOrderActionSuccessMessage(action)
            : "La operación terminó, pero el cliente no tiene un teléfono válido para WhatsApp."
        );
      }
    } catch (currentError) {
      setError(
        currentError instanceof DOMException && currentError.name === "AbortError"
          ? "La solicitud tardó demasiado. Revisa el pedido antes de reintentar."
          : currentError instanceof Error
          ? currentError.message
          : "No fue posible actualizar el pedido."
      );
      return;
    } finally {
      orderActionsInFlightRef.current.delete(actionKey);
      setBusyOrderId((current) => current === pedidoId ? "" : current);
    }
  }

  async function saveCustomer(payload: {
    id: string;
    nombre: string;
    telefono: string;
    lugarTrabajo: string;
  }) {
    try {
      setCustomerSaveLoading(true);
      setError("");
      setSuccessMessage("");

      const response = await fetch(`/api/admin/customers/${payload.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const currentData = (await response.json()) as {
        customer?: AdminCustomerOption;
        error?: string;
      };

      if (!response.ok || !currentData.customer) {
        throw new Error(currentData.error ?? "No fue posible actualizar el cliente.");
      }

      setCustomers((current) =>
        current.map((customer) =>
          customer.id === currentData.customer?.id ? currentData.customer : customer
        )
      );
      setCustomerEditModalState(null);
      setSuccessMessage("Cliente actualizado correctamente.");
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible actualizar el cliente."
      );
    } finally {
      setCustomerSaveLoading(false);
    }
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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col gap-5 overflow-x-hidden bg-[#f7f8fa] px-4 py-4 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
      <AdminNotificationBadge count={attentionCount} onClick={openAttentionOrders} />

      <section className="max-w-full overflow-x-hidden rounded-2xl bg-[#17191f] p-5 text-white shadow-[0_16px_36px_rgba(17,19,24,0.16)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#c8c0ff]">
              <Store className="h-4 w-4" />
              Panel admin
            </span>
            <div className="flex items-center gap-4">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
                <span className="text-lg font-bold text-[#17191f]">S</span>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                  Smellme.cl
                </div>
                <h1 className="text-2xl font-bold tracking-[-0.035em] text-white sm:text-3xl">
                  {currentViewMeta.title}
                </h1>
              </div>
            </div>
            <div className="space-y-1">
              <p className="max-w-3xl text-sm leading-6 text-white/65">
                {currentViewMeta.description}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                Smellme.cl admin
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
              accessibilityLabel="Notificaciones"
            />
            <HeaderIconButton
              label="Actualizar"
              title="Actualizar"
              onClick={() => void refreshAll()}
              icon={<RefreshCcw className="h-5 w-5" />}
              accent="soft"
            />
            <HeaderIconButton
              label="Configuración"
              title="Configuración del negocio"
              onClick={() => router.push("/admin/configuracion")}
              icon={<Settings className="h-5 w-5" />}
            />
          </div>
        </div>
      </section>

      <AdminNav />

      {error ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {successMessage}
        </div>
      ) : null}

      {whatsAppFallback ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-brand-950/35 px-3 pt-6 sm:items-center sm:p-6" role="presentation">
          <button type="button" aria-label="Cerrar acciones de WhatsApp" className="absolute inset-0" onClick={() => setWhatsAppFallback(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="whatsapp-action-title" className="relative max-h-[calc(100dvh-24px)] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-amber-200 bg-amber-50 p-5 pb-[calc(20px+env(safe-area-inset-bottom))] text-sm text-amber-950 shadow-[0_-20px_60px_rgba(17,19,24,0.24)] sm:rounded-[28px]">
            <h2 id="whatsapp-action-title" className="text-lg font-bold">
              {whatsAppFallback.action === "pagado" ? "Pago confirmado correctamente" : "Mensaje de WhatsApp preparado"}
            </h2>
            <p className="mt-2 text-amber-900/85">
              Abre WhatsApp cuando quieras. La operación ya terminó y no se repetirá al usar este enlace.
            </p>
            {whatsAppFallback.reason === "invalid-phone" ? <p className="mt-2 font-semibold">El teléfono no es válido. Puedes copiar el mensaje y enviarlo manualmente.</p> : null}
            <textarea readOnly value={whatsAppFallback.message} className="mt-3 min-h-32 w-full rounded-2xl border border-amber-200 bg-white px-3 py-3 text-sm text-brand-950" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {whatsAppFallback.url ? (
                <a href={whatsAppFallback.url} className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-[#25D366] px-4 py-3 text-sm font-semibold text-white" onClick={() => setSuccessMessage("WhatsApp abierto con el mensaje preparado.")}>
                  {whatsAppFallback.action === "pagado" ? "Enviar confirmación por WhatsApp" : "Abrir WhatsApp"}
                </a>
              ) : null}
              <button type="button" onClick={() => void copyWhatsAppFallbackMessage()} className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-amber-500 px-4 py-3 text-sm font-semibold text-white">Copiar mensaje</button>
              <button type="button" onClick={returnToWhatsAppOrder} className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-950">Volver al pedido</button>
              <button type="button" onClick={() => setWhatsAppFallback(null)} className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-950">Cerrar</button>
            </div>
          </div>
        </div>
      ) : null}

      {view === "home" ? (
        <DashboardHomeView
          attentionCount={attentionCount}
          badgeActionLoading={badgeActionLoading}
          badgeCardLoading={badgeCardLoading}
          badgeDeviceId={badgeDeviceId}
          badgeDeviceSetting={badgeDeviceSetting}
          badgeSupported={badgeSupported}
          homeSummary={homeSummary}
          isInstalledPwa={isInstalledPwa}
          notificationPermission={notificationPermission}
          pendingUnseenOrders={pendingUnseenOrders}
          paymentSettingsComplete={paymentSettingsComplete}
          pushSubscriptionActive={pushSubscriptionActive}
          pushSupported={pushSupported}
          weekSalesTotal={weekSalesTotal}
          renderNewOrderWhatsAppButton={(order) => <NewOrderWhatsAppButton order={order} />}
          onActivateBadgeForCurrentDevice={() => void activateBadgeForCurrentDevice()}
          onMarkOrderSeen={(order) => void runAction(order.id, "visto", order)}
          onOpenAttentionOrders={openAttentionOrders}
          onOpenPendingOrderDetail={(orderId) => {
            openAttentionOrders();
            setSelectedOrderId(orderId);
          }}
          onTestBadgeOnCurrentDevice={() => void testBadgeOnCurrentDevice()}
          onTestPushOnCurrentDevice={() => void testPushOnCurrentDevice()}
        />
      ) : null}

      {view === "agenda" ? (
        <section className="space-y-5">
          <SectionIntro
            title="Agenda de pedidos"
            subtitle="Confirma pedidos, asigna fecha y revisa cada cliente sin perderte."
            icon={ClipboardList}
            helper="Paso 1: entra aquí varias veces al día. Lo pendiente arriba, el detalle al costado."
          />

          <div className="grid gap-4 rounded-lg border border-brand-100 bg-white/90 p-4 shadow-soft lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-900">
                <Search className="h-4 w-4" />
                Buscar pedido
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, teléfono, producto o fecha"
                className="w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950 outline-none placeholder:text-brand-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-brand-900">Vista</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
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

                      if (action === "pagado") {
                        setOrderModalState({ type: "pagado", order });
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

                      if (action === "reenviar-transferencia") {
                        void runAction(order.id, action, order);
                        return;
                      }

                      void runAction(order.id, action, order);
                    }}
                  />
                ))}

              {statusFilter === "historial" ? (
                <div className="grid gap-5">
                  <OrderSection
                    title="Pagados"
                    subtitle="Pedidos con pago confirmado y entrega por coordinar."
                    orders={ordersByFilter.finalizados.filter(
                      (order) => order.estadoPedido === "PAGADO"
                    )}
                    loading={loading}
                    emptyText="No hay pedidos pagados pendientes de coordinación."
                    busyOrderId={busyOrderId}
                    selectedOrderId={selectedOrderId}
                    actions={[
                      {
                        key: "coordinar-entrega",
                        label: "Coordinar entrega por WhatsApp",
                        tone: "primary"
                      },
                      {
                        key: "pagado",
                        label: "Pago confirmado",
                        tone: "muted",
                        disabled: true
                      }
                    ]}
                    onSelect={setSelectedOrderId}
                    onAction={(order, action) => {
                      if (action === "coordinar-entrega") {
                        void runAction(order.id, action, order);
                      }
                    }}
                  />
                  <CompactHistorySection
                    title="Pedidos cerrados"
                    subtitle="Ventas ya resueltas."
                    orders={ordersByFilter.finalizados.filter(
                      (order) => order.estadoPedido !== "PAGADO"
                    )}
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
              <aside className="rounded-lg border border-brand-200 bg-[linear-gradient(180deg,#f7f8fa_0%,#ffffff_100%)] p-5 shadow-soft xl:sticky xl:top-5 xl:h-fit">
                <div className="mb-4 rounded-2xl border border-brand-100 bg-white px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700/70">
                    Resumen del pedido seleccionado
                  </div>
                  <p className="mt-1 text-sm text-brand-900/65">
                    Aqui se ve el detalle completo del pedido activo sin confundirse con la lista.
                  </p>
                </div>
                <OrderDetailPanel order={selectedOrder} agendaGroups={agendaGroups} />
              </aside>
            ) : null}
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
            <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-brand-950">Cerrar pedidos agendados</h2>
                <p className="text-sm text-brand-900/70">
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
                    onPaid={() => setOrderModalState({ type: "pagado", order })}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-brand-950">Fiados pendientes</h2>
                <p className="text-sm text-brand-900/70">
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
                    className="rounded-lg border border-brand-100 bg-brand-50/60 p-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-brand-950">{customer.nombre}</div>
                          <div className="mt-1 space-y-1 text-sm text-brand-900/65">
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

                      <div className="space-y-3 rounded-xl border border-brand-100 bg-white px-3 py-3">
                        {customer.fiados.map((fiado) => (
                          <div
                            key={fiado.id}
                            className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/40 px-3 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-brand-950">
                                  Pedido del {formatFiadoDate(fiado)}
                                </div>
                                <div className="text-sm text-brand-900/65">
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
                                    <div className="text-brand-950">
                                      {item.cantidad}x {item.productoNombre}
                                    </div>
                                    <div className="text-right font-semibold text-brand-700">
                                      {formatCurrency(item.subtotal)}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-brand-900/65">
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

          <section className="rounded-[24px] border border-brand-100 bg-white/90 p-5 shadow-soft">
            <div className="flex items-center gap-2 text-brand-950">
              <Archive className="h-5 w-5" />
              <h3 className="text-lg font-bold">Cierre de mes</h3>
            </div>
            <p className="copy-justified mt-3 text-sm leading-6 text-brand-900/70">
              Usa cierre de mes cuando ya no queden pedidos pendientes ni agendados y
              quieras archivar la operación completa del periodo. Esta vista ya no expone
              herramientas de prueba para mantener el flujo más limpio y profesional.
            </p>
            <div className="mt-4">
              <article className="rounded-[20px] border border-brand-100 bg-brand-50/70 p-4">
                <h4 className="text-base font-semibold text-brand-950">Cierre de mes</h4>
                <p className="copy-justified mt-2 text-sm leading-6 text-brand-900/70">
                  Archiva pedidos, items, pagos, fiados y clientes en un log histórico y
                  deja limpio el panel operativo. Conserva productos y stock.
                </p>
                <button
                  type="button"
                  disabled={busyMaintenanceAction !== ""}
                  onClick={() => void runMaintenanceAction("close-month")}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[18px] bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-brand-300"
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

          <section className="overflow-hidden rounded-[30px] border border-[#e4e7ec] bg-[linear-gradient(135deg,#f7f8fa_0%,#f5f3ff_55%,#f7f8fa_100%)] p-4 shadow-[0_20px_40px_rgba(17, 19, 24,0.08)] sm:p-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e4e7ec] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#5434e6]">
                    Clientes
                  </span>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-[#111318] sm:text-3xl">
                      Administra tus clientes y revisa su actividad
                    </h2>
                    <p className="max-w-2xl text-sm leading-6 text-[#667085]">
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

              {customersLoading ? (
                <p className="text-sm text-[#667085]">Cargando clientes...</p>
              ) : null}
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
                  onEdit={() =>
                    setCustomerEditModalState({
                      customer: {
                        id: customer.clienteId,
                        nombre: customer.nombre,
                        telefono: customer.telefono,
                        lugarTrabajo: customer.lugarTrabajo
                      }
                    })
                  }
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
                className="rounded-lg border border-brand-100 bg-white/90 p-4 shadow-soft"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-brand-950">{customer.nombre}</h3>
                      <p className="mt-1 text-sm text-brand-900/65">{customer.lugarTrabajo}</p>
                    </div>
                    <StatusBadge tone="neutral" label={`${customer.pedidos} pedido(s)`} />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-brand-900/70">
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

                  <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-brand-700/70">
                      Fechas agendadas
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {customer.proximasFechas.length === 0 ? (
                        <span className="text-sm text-brand-900/55">Sin fechas activas</span>
                      ) : (
                        customer.proximasFechas.slice(0, 4).map((fecha) => (
                          <span
                            key={`${customer.clienteId}-${fecha}`}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-800"
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
            subtitle="Resumen de ventas, costos y utilidad real."
            icon={CalendarRange}
            helper="Revisa márgenes, costos estimados y productos más rentables."
          />

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-brand-100 bg-white/90 p-4 shadow-soft sm:p-5">
            <div className="space-y-4">
              <SegmentedControl
                value={reportTab}
                onChange={(value) => setReportTab(value as ReportTab)}
                options={[
                  { value: "resumen", label: "Resumen" },
                  { value: "rentabilidad", label: "Rentabilidad" }
                ]}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <CompactSelect
                  label="Periodo"
                  value={reportRangePreset}
                  onChange={(value) => applyReportRangePreset(value as ReportRangePreset)}
                  options={reportRangeOptions}
                />
                <CompactSelect
                  label="Canal"
                  value={reportSalesFilter}
                  onChange={(value) => setReportSalesFilter(value as ReportSalesFilter)}
                  options={reportSalesOptions}
                />
              </div>
            </div>

            {reportRangePreset === "custom" ? (
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                <ReportDateField
                  label="Desde"
                  value={reportFrom}
                  onChange={handleReportFromChange}
                />
                <ReportDateField
                  label="Hasta"
                  value={reportTo}
                  onChange={handleReportToChange}
                />
              </div>
            ) : null}
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
                <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-brand-950">
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
                        className="rounded-lg border border-brand-100 bg-white p-4"
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-[380px]:grid-cols-1 max-[380px]:items-start">
                          <div className="min-w-0">
                            <div className="font-semibold leading-5 text-brand-950">{item.nombre}</div>
                            <div className="mt-1 text-sm leading-5 text-brand-900/65">
                              {item.unidades} unidades
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-brand-700">
                            {formatCurrency(item.total)}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-brand-950">
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
                        className="rounded-lg border border-brand-100 bg-white p-4"
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-[380px]:grid-cols-1 max-[380px]:items-start">
                          <div className="min-w-0">
                            <div className="font-semibold leading-5 text-brand-950">{item.nombre}</div>
                            <div className="mt-1 text-sm leading-5 text-brand-900/65">
                              {item.pedidos} pedido(s)
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-brand-700">
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
                  profitabilitySummary.totalProductosEstimados > 0
                    ? `Incluye ${profitabilitySummary.totalProductosEstimados} producto(s) con costo estimado al 50%.`
                    : "Todas las ventas del rango tienen costo real guardado."
                }
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <HeroMetric
                  label="Ventas totales"
                  value={formatCurrency(profitabilitySummary.totalVentas)}
                  detail={`${profitabilitySummary.totalPedidos} ventas cerradas`}
                  icon={CircleDollarSign}
                  tone="emerald"
                />
                <HeroMetric
                  label="Costos totales"
                  value={formatCurrency(profitabilitySummary.totalCostos)}
                  detail={
                    profitabilitySummary.totalProductosEstimados > 0
                      ? "Incluye costos reales y estimados"
                      : "Costeo acumulado del periodo"
                  }
                  icon={Boxes}
                  tone="violet"
                />
                <HeroMetric
                  label="Utilidad"
                  value={formatCurrency(profitabilitySummary.totalUtilidad)}
                  detail="Resultado bruto del período"
                  icon={Sparkles}
                  tone="rose"
                />
                <HeroMetric
                  label="Margen"
                  value={formatPercent(profitabilitySummary.margenPromedio)}
                  detail="Promedio sobre ventas del rango"
                  icon={BarChart3}
                  tone="amber"
                />
                <HeroMetric
                  label="Costo real"
                  value={String(profitabilitySummary.totalProductosConCostoReal)}
                  detail="Productos vendidos con costo real"
                  icon={CheckCircle2}
                  tone="emerald"
                />
                <HeroMetric
                  label="Costo estimado IA"
                  value={String(profitabilitySummary.totalProductosEstimados)}
                  detail="Productos vendidos con fallback 50%"
                  icon={AlertCircle}
                  tone="amber"
                />
              </div>

              {profitabilitySummary.totalProductosEstimados > 0 ? (
                <div className="rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                  Incluye costos estimados al 50% en productos sin costo real.
                </div>
              ) : null}

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-brand-950">
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

                <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-brand-950">
                    <Sparkles className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Top 5 por utilidad</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {profitabilitySummary.topProductosPorUtilidad.length === 0 ? (
                      <EmptyState text="No hay productos vendidos en este rango." />
                    ) : null}
                    {profitabilitySummary.topProductosPorUtilidad.map((item) => (
                      <article
                        key={`${item.id}-${item.nombre}-profit`}
                        className="rounded-lg border border-brand-100 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-brand-950">{item.nombre}</div>
                            <div className="text-sm text-brand-900/65">
                              {item.unidades} unidades · {formatPercent((item.utilidad / item.ventaTotal) * 100)}
                            </div>
                          </div>
                          <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap max-[380px]:justify-start">
                            <CostStatusBadge status={item.status} compact />
                            <div className="text-sm font-semibold text-brand-700">
                              {formatCurrency(item.utilidad)}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-brand-950">
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
                        className="rounded-lg border border-brand-100 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-brand-950">{item.label}</div>
                            <div className="text-sm text-brand-900/65">
                              {item.pedidos} pedido(s) · {item.unidades} unidades
                            </div>
                          </div>
                          <CostStatusBadge status={item.status} compact />
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <MiniMetric label="Ventas" value={formatCurrency(item.ventaTotal)} />
                          <MiniMetric label="Costos" value={formatCurrency(item.costoTotal)} />
                          <MiniMetric label="Utilidad" value={formatCurrency(item.utilidad)} />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-brand-950">
                    <AlertCircle className="h-5 w-5" />
                    <h3 className="text-lg font-bold">Productos con costo estimado</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    {profitabilitySummary.productosConCostoEstimado.length === 0 ? (
                      <EmptyState text="Todos los productos vendidos tienen costo real configurado." />
                    ) : null}
                    {profitabilitySummary.productosConCostoEstimado.map((item) => (
                      <article
                        key={`${item.id}-${item.nombre}-estimated`}
                        className="rounded-lg border border-amber-200 bg-amber-50/80 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-amber-950">{item.nombre}</div>
                            <div className="text-sm text-amber-900/75">
                              {item.unidades} unidades · {formatCurrency(item.ventaTotal)}
                            </div>
                          </div>
                          <CostStatusBadge status="estimated" compact />
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <MiniMetric label="Venta" value={formatCurrency(item.ventaTotal)} />
                          <MiniMetric label="Costo estimado" value={formatCurrency(item.costoTotal)} />
                          <MiniMetric label="Utilidad estimada" value={formatCurrency(item.utilidad)} />
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <section className="rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft">
                <div className="flex items-center gap-2 text-brand-950">
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
                      className="rounded-lg border border-brand-100 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-brand-950">{item.nombre}</div>
                          <div className="text-sm text-brand-900/65">
                            {item.unidades} unidades vendidas
                          </div>
                        </div>
                        <CostStatusBadge status={item.status} />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                        <MiniMetric label="Unidades" value={String(item.unidades)} />
                        <MiniMetric label="Ventas" value={formatCurrency(item.ventaTotal)} />
                        <MiniMetric label="Costos" value={formatCurrency(item.costoTotal)} />
                        <MiniMetric label="Utilidad" value={formatCurrency(item.utilidad)} />
                        <MiniMetric label="Margen" value={formatPercent(item.margen ?? 0)} />
                        <MiniMetric label="Estado costo" value={getCostStatusLabel(item.status)} />
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

      {customerEditModalState ? (
        <CustomerEditModal
          key={customerEditModalState.customer.id}
          state={customerEditModalState}
          busy={customerSaveLoading}
          onClose={() => setCustomerEditModalState(null)}
          onSave={saveCustomer}
        />
      ) : null}

      <AppFooter className="pb-24 md:pb-8" />
      <WhatsAppFloatingButton
        hidden={Boolean(orderModalState || customerEditModalState)}
        bottomOffsetClassName={
          view === "home"
            ? "bottom-[calc(24px+env(safe-area-inset-bottom))]"
            : "bottom-[calc(88px+env(safe-area-inset-bottom))]"
        }
      />
    </main>
  );
}

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
      className="scroll-mt-32 rounded-lg border border-brand-100 bg-white/90 p-5 shadow-soft"
    >
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-brand-950">{title}</h2>
        <p className="text-sm text-brand-900/70">{subtitle}</p>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? <EmptyState text="Cargando pedidos..." /> : null}
        {!loading && orders.length === 0 ? <EmptyState text={emptyText} /> : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className={`rounded-lg border p-4 ${
              selectedOrderId === order.id
                ? "border-brand-300 bg-brand-50"
                : "border-brand-100 bg-white"
            }`}
          >
            <button type="button" onClick={() => onSelect(order.id)} className="w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-brand-950">
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
                  <div className="flex items-center gap-2 text-sm text-brand-900/65">
                    <Phone className="h-4 w-4" />
                    {order.clienteTelefono || "Sin teléfono"}
                  </div>
                  <div className="space-y-1 text-sm text-brand-900/65">
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
                  <StatusBadge
                    tone="pedido"
                    label={ESTADO_PEDIDO_LABELS[order.estadoPedido as EstadoPedido] ?? order.estadoPedido}
                  />
                  <StatusBadge
                    tone={order.estadoPago === "SIN_PAGO" && order.saldoPendiente > 0 ? "warning" : "neutral"}
                    label={ESTADO_PAGO_LABELS[order.estadoPago as EstadoPago] ?? order.estadoPago}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <MiniMetric label="Total" value={formatCurrency(order.total)} />
                <MiniMetric label="Saldo" value={formatCurrency(order.saldoPendiente)} />
                <MiniMetric label="Ingreso" value={formatShortDateTime(order.fechaPedido)} />
              </div>

              <div className="mt-3 xl:hidden">
                <span className="inline-flex min-h-10 items-center rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm font-semibold text-brand-900">
                  Ver detalle abajo
                </span>
              </div>

              {selectedOrderId === order.id ? (
                <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-3 xl:hidden">
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
                          <div className="text-sm font-semibold text-brand-950">
                            {item.productoNombre}
                          </div>
                          <div className="text-xs text-brand-900/65">
                            {item.cantidad} x {formatCurrency(item.precioUnitario)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-brand-700">
                          {formatCurrency(item.subtotal)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </button>

            {actions.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    disabled={busyOrderId === order.id || action.disabled}
                    onClick={() => onAction(order, action.key)}
                    className={`${buttonToneClass(action.tone)} w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`}
                  >
                    {busyOrderId === order.id ? "Procesando..." : action.label}
                  </button>
                ))}
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
          <h2 className="text-xl font-bold text-brand-950">{order.clienteNombre}</h2>
          <StatusBadge
            tone="pedido"
            label={ESTADO_PEDIDO_LABELS[order.estadoPedido as EstadoPedido] ?? order.estadoPedido}
          />
          <StatusBadge
            tone={order.estadoPago === "SIN_PAGO" && order.saldoPendiente > 0 ? "warning" : "neutral"}
            label={ESTADO_PAGO_LABELS[order.estadoPago as EstadoPago] ?? order.estadoPago}
          />
          {order.adminSeen === false ? <StatusBadge tone="warning" label="SIN VER" /> : null}
        </div>
        <div className="grid gap-1 text-sm text-brand-900/70 sm:grid-cols-2">
          {order.clienteRut ? <div>RUT: {order.clienteRut}</div> : null}
          {order.clienteEmail ? <div>{order.clienteEmail}</div> : null}
          {order.clienteDireccion ? (
            <div className="sm:col-span-2">
              {order.clienteDireccion}
              {order.clienteComuna ? `, ${order.clienteComuna}` : ""}
              {order.clienteRegion ? `, ${order.clienteRegion}` : ""}
            </div>
          ) : (
            <div className="sm:col-span-2">{order.clienteLugarTrabajo || "Sin direccion registrada"}</div>
          )}
          {order.metodoDespacho ? (
            <div>
              Despacho: {METODO_DESPACHO_LABELS[order.metodoDespacho as MetodoDespacho] ?? order.metodoDespacho}
              {" · "}
              {order.costoDespacho ? formatCurrency(order.costoDespacho) : "Por pagar"}
            </div>
          ) : null}
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
        <section className="rounded-lg border border-brand-100 bg-white p-4 shadow-soft">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-700/70">
              Confirmación al cliente
            </div>
            <p className="text-sm text-brand-900/70">
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

      <section className="rounded-lg border border-brand-100 bg-brand-50/60 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-700/70">
          Productos
        </div>
        <div className="mt-3 space-y-3">
          {order.items.map((item) => (
            <div
              key={`${order.id}-${item.productoId}`}
              className="rounded-lg border border-brand-100 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-brand-950">{item.productoNombre}</div>
                  <div className="text-sm text-brand-900/65">
                    {formatCurrency(item.precioUnitario)} x {item.cantidad}
                  </div>
                  <div className="text-xs text-brand-700/75">
                    Costo {formatCurrency(item.costoUnitario)} · Utilidad{" "}
                    {formatCurrency(item.utilidadBruta)}
                  </div>
                </div>
                <div className="text-sm font-semibold text-brand-700">
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
      } border border-brand-100 bg-brand-50 text-brand-900/55`}
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
      className={`${className} ${
        fullWidth ? "w-full" : "w-full sm:w-auto"
      } border border-brand-200 bg-white text-brand-900`}
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
      className={`${className} ${
        fullWidth ? "w-full" : "w-full sm:w-auto"
      } border border-brand-200 bg-white text-brand-900`}
    >
      <MessageCircle className="h-4 w-4" />
      Cobrar por WhatsApp
    </a>
  );
}

function PaymentOrderCard({
  order,
  busy,
  onPaid
}: {
  order: AdminOrderSummary;
  busy: boolean;
  onPaid: () => void;
}) {
  return (
    <article className="rounded-lg border border-brand-100 bg-brand-50/60 p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-brand-950">{order.clienteNombre}</div>
            <div className="mt-1 space-y-1 text-sm text-brand-900/65">
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
            label={order.fechaAgendado ? formatShortDateTime(order.fechaAgendado) : "Sin agendar"}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Total" value={formatCurrency(order.total)} />
          <MiniMetric label="Teléfono" value={order.clienteTelefono || "-"} />
        </div>

        <div className="grid gap-2 sm:grid-cols-1">
          <button
            type="button"
            disabled={busy}
            onClick={onPaid}
            className={`${buttonToneClass("primary")} w-full justify-center`}
          >
            {busy ? "Procesando..." : "Confirmar pago"}
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-950/20 px-4 py-4">
      <div className="mx-auto max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[20px] border border-brand-100 bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-soft">
        <div className="space-y-1">
          <div className="inline-flex rounded-2xl bg-brand-100 p-3 text-brand-700">
            {state.type === "agendar" ? (
              <CalendarClock className="h-5 w-5" />
            ) : state.type === "pagado" ? (
              <CircleDollarSign className="h-5 w-5" />
            ) : state.type === "cancelar" ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <HandCoins className="h-5 w-5" />
            )}
          </div>
          <h3 className="pt-2 text-xl font-bold text-brand-950">
            {state.type === "agendar"
              ? "Agendar pedido"
              : state.type === "pagado"
                ? "Confirmar pago"
                : state.type === "cancelar"
                  ? "Cancelar pedido"
                  : "Registrar abono"}
          </h3>
          <p className="text-sm text-brand-900/70">{state.order.clienteNombre}</p>
        </div>

        <div className="mt-4 space-y-4">
          {state.type === "agendar" ? (
            <p className="text-sm text-brand-900/70">
              El pedido pasa a AGENDADO. La fecha y sucursal de despacho se coordinan por
              WhatsApp, no se elige aqui.
            </p>
          ) : null}

          {state.type === "pagado" ? (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-sm font-semibold text-brand-950">
                Total a confirmar: {formatCurrency(state.order.total)}
              </p>
              <p className="text-sm text-brand-900/70">
                Esto registra la venta y convierte la reserva de stock en una salida definitiva.
                Esta accion no se puede deshacer desde aqui.
              </p>
            </div>
          ) : null}

          {state.type === "cancelar" ? (
            <label className="space-y-2">
              <span className="text-sm font-semibold text-brand-900">Motivo</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
              />
            </label>
          ) : null}

          {state.type === "abonar" ? (
            <>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-brand-900">Monto abonado</span>
                <input
                  type="number"
                  min={1}
                  max={state.order.saldoPendiente}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-brand-900">Metodo de pago</span>
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="w-full rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-950"
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
            className="rounded-lg border border-brand-100 bg-white px-4 py-2 text-sm font-semibold text-brand-900"
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onConfirm(
                state.type === "cancelar"
                  ? {
                      motivoCancelacion:
                        reason.trim() || "Cancelado por administrador"
                    }
                  : state.type === "abonar"
                    ? {
                        monto: Number(amount),
                        metodoPago: method
                      }
                    : {}
              )
            }
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {busy ? "Guardando..." : "Confirmar"}
          </button>
        </div>
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
      accent: "bg-[#7357ff]"
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
      accent: "bg-[#5434e6]"
    }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article
          key={item.label}
          className="rounded-[24px] border border-[#e4e7ec] bg-white p-4 shadow-[0_12px_30px_rgba(17, 19, 24,0.08)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#667085]">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-[#111318]">{item.value}</p>
            </div>
            <span className={`mt-1 h-3 w-3 rounded-full ${item.accent}`} />
          </div>
          <p className="mt-3 text-sm leading-5 text-[#667085]">{item.detail}</p>
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
    <label className="flex w-full max-w-xl items-center gap-3 rounded-[22px] border border-[#e4e7ec] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(17, 19, 24,0.08)]">
      <Search className="h-5 w-5 text-[#5434e6]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar por nombre, teléfono o unidad..."
        className="w-full border-0 bg-transparent p-0 text-[15px] text-[#111318] outline-none placeholder:text-[#667085]"
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
                ? "border-[#7357ff] bg-[#7357ff] text-white shadow-[0_10px_24px_rgba(115, 87, 255,0.22)]"
                : "border-[#e4e7ec] bg-white text-[#5434e6]"
            }`}
          >
            <span>{filter.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                active ? "bg-white/20 text-white" : "bg-[#eeebff] text-[#5434e6]"
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
  onEdit,
  onOpenOrders,
  onOpenPayments
}: {
  customer: CustomerCardData;
  onEdit: () => void;
  onOpenOrders: () => void;
  onOpenPayments: () => void;
}) {
  const initial = customer.nombre.trim().charAt(0).toUpperCase() || "C";
  const lastMovementLabel = customer.ultimoMovimiento
    ? formatDateOnly(customer.ultimoMovimiento.slice(0, 10))
    : "Sin actividad";
  const lastOrderLabel = customer.ultimoMovimiento
    ? formatShortDateTime(customer.ultimoMovimiento)
    : "Sin pedidos";

  return (
    <article className="overflow-hidden rounded-[28px] border border-[#e4e7ec] bg-white shadow-[0_18px_40px_rgba(17, 19, 24,0.08)]">
      <div className="border-b border-[#e4e7ec] bg-[linear-gradient(135deg,#f7f8fa_0%,#f5f3ff_72%,#FFFFFF_100%)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#eeebff] text-lg font-bold text-[#5434e6] shadow-[0_10px_20px_rgba(115, 87, 255,0.15)]">
              {initial}
            </div>
            <div className="min-w-0 space-y-2">
              <h3 className="text-xl font-bold text-[#111318]">{customer.nombre}</h3>
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
          <span className="rounded-full border border-[#e4e7ec] bg-white px-3 py-1 text-xs font-semibold text-[#5434e6]">
            {lastMovementLabel}
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
          <MiniMetric label="Último pedido" value={lastOrderLabel} />
        </div>

        <div className="rounded-[22px] border border-[#e4e7ec] bg-[#f7f8fa] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5434e6]">
            Fechas agendadas
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {customer.proximasFechas.length === 0 ? (
              <span className="text-sm text-[#667085]">Sin pedidos agendados por ahora</span>
            ) : (
              customer.proximasFechas.slice(0, 4).map((fecha) => (
                <span
                  key={`${customer.clienteId}-${fecha}`}
                  className="rounded-full border border-[#e4e7ec] bg-white px-3 py-1 text-xs font-semibold text-[#5434e6]"
                >
                  {formatDateOnly(fecha)}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-sm font-semibold text-[#5434e6]"
          >
            Editar cliente
          </button>
          <button
            type="button"
            onClick={onOpenOrders}
            className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-[#7357ff] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(115, 87, 255,0.2)]"
          >
            Ver pedidos
          </button>
          <button
            type="button"
            onClick={onOpenPayments}
            className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3 text-sm font-semibold text-[#5434e6]"
          >
            Revisar cobros
          </button>
        </div>
      </div>
    </article>
  );
}

function CustomerEditModal({
  state,
  busy,
  onClose,
  onSave
}: {
  state: NonNullable<CustomerEditModalState>;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: {
    id: string;
    nombre: string;
    telefono: string;
    lugarTrabajo: string;
  }) => void | Promise<void>;
}) {
  const [nombre, setNombre] = useState(state.customer.nombre);
  const [telefono, setTelefono] = useState(state.customer.telefono);
  const [lugarTrabajo, setLugarTrabajo] = useState(state.customer.lugarTrabajo);

  return (
    <div className="fixed inset-0 z-[110] bg-[#111318]/35 p-4 backdrop-blur-[2px]">
      <div className="mx-auto flex min-h-full w-full max-w-xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[30px] border border-[#e4e7ec] bg-white shadow-[0_30px_60px_rgba(17, 19, 24,0.22)]">
          <div className="border-b border-[#e4e7ec] bg-[linear-gradient(135deg,#f7f8fa_0%,#f5f3ff_72%,#FFFFFF_100%)] p-5">
            <div className="space-y-2">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e4e7ec] bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#5434e6]">
                Editar cliente
              </span>
              <h3 className="text-xl font-bold text-[#111318]">Actualiza datos sin tocar pedidos</h3>
              <p className="text-sm leading-6 text-[#667085]">
                Este cambio solo actualiza el cliente seleccionado. Si el telefono o la identidad ya
                existen en otro registro, bloqueamos el guardado para evitar cruces.
              </p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-[#111318]">Nombre</span>
              <input
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className="block min-h-11 w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
                placeholder="Ejemplo: Claudia"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[#111318]">Telefono</span>
              <input
                value={telefono}
                onChange={(event) => setTelefono(formatChileanMobileInput(event.target.value))}
                className="block min-h-11 w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
                placeholder="9 1234 5678"
              />
              <p className="text-xs text-[#667085]">Puedes dejarlo vacio si no corresponde.</p>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-[#111318]">Unidad o lugar de trabajo</span>
              <input
                value={lugarTrabajo}
                onChange={(event) => setLugarTrabajo(event.target.value)}
                className="block min-h-11 w-full rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-base text-[#111318] outline-none"
                placeholder="Ejemplo: Finanzas"
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[#e4e7ec] bg-white/95 px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-[18px] border border-[#e4e7ec] bg-white px-4 py-3 text-sm font-semibold text-[#5434e6]"
            >
              Cerrar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onSave({
                  id: state.customer.id,
                  nombre,
                  telefono,
                  lugarTrabajo
                })
              }
              className="min-h-11 rounded-[18px] bg-[#7357ff] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(115, 87, 255,0.2)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy ? "Guardando..." : "Guardar cliente"}
            </button>
          </div>
        </div>
      </div>
    </div>
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
    <div className="rounded-[20px] border border-[#e4e7ec] bg-[#f7f8fa] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#5434e6]">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold leading-6 text-[#111318]">{value}</div>
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
      ? "border-[#e4e7ec] bg-[#eeebff] text-[#5434e6]"
      : tone === "danger"
        ? "border-[#F5C0BB] bg-[#FFF0EF] text-[#D66D63]"
        : tone === "accent"
          ? "border-[#F0E2AA] bg-[#FFF8DE] text-[#8A6A14]"
          : "border-[#e4e7ec] bg-white text-[#5434e6]";

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
    <div className="rounded-[28px] border border-dashed border-[#e4e7ec] bg-[#f7f8fa] p-8 text-center shadow-soft">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#5434e6] shadow-[0_12px_24px_rgba(17, 19, 24,0.08)]">
        <UserRound className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-xl font-bold text-[#111318]">
        {hasSearch ? "No encontramos coincidencias." : "Aún no hay clientes registrados."}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
        {hasSearch
          ? "Prueba con otro nombre, teléfono o lugar de trabajo para seguir buscando."
          : "Cuando ingresen pedidos, aparecerán aquí automáticamente."}
      </p>
    </div>
  );
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
}

function getDebtCollectionAction(order: AdminOrderSummary) {
  if (order.saldoPendiente <= 0 && order.estadoPago !== "SIN_PAGO") {
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
    `Muchas gracias por preferir Smellme.cl ${waHeartEmoji()}`,
    "Le env\u00EDo el detalle de su cuenta:",
    "",
    `${waSparklesEmoji()}Monto total: ${total}`,
    `${waMemoEmoji()}Detalle:`,
    detail,
    "",
    "Escríbeme por este mismo medio para coordinar la forma de pago.",
    "",
    `¡Muchas gracias nuevamente! ${waHugEmoji()}`
  ].join("\n");
}

function getNewOrderAdminWhatsAppUrl(order: AdminOrderSummary) {
  return buildWhatsAppShareUrl(
    buildAdminOrderAlertMessage({
      customerName: order.clienteNombre,
      codigo: order.codigo,
      total: order.total,
      metodoDespacho: order.metodoDespacho as MetodoDespacho | undefined,
      costoDespacho: order.costoDespacho,
      items: order.items.map((item) => ({
        name: item.productoNombre,
        quantity: item.cantidad
      }))
    })
  ) ?? "#";
}

function shouldShowOrderWhatsAppAction(order: AdminOrderSummary) {
  return order.estadoPedido !== "NUEVO" && order.estadoPedido !== "CANCELADO";
}

function getOrderWhatsAppNotification(order: AdminOrderSummary) {
  return notificationService.prepareOrderConfirmationNotification({
    customerName: order.clienteNombre,
    customerPhone: order.clienteTelefono,
    codigo: order.codigo,
    items: order.items.map((item) => ({
      name: item.productoNombre,
      quantity: item.cantidad
    })),
    subtotal: order.total - (order.costoDespacho ?? 0),
    costoDespacho: order.costoDespacho,
    total: order.total,
    metodoDespacho: order.metodoDespacho as MetodoDespacho | undefined,
    direccion: order.clienteDireccion
  });
}

function getOrderActionSuccessMessage(action: AdminOrdersAction) {
  switch (action) {
    case "agendar":
      return "Pedido atendido correctamente. El mensaje de transferencia está listo.";
    case "reenviar-transferencia":
      return "Datos de pago preparados nuevamente en WhatsApp.";
    case "pagado":
      return "Pago confirmado correctamente.";
    case "coordinar-entrega":
      return "Coordinación de entrega preparada en WhatsApp.";
    default:
      return "Operación completada.";
  }
}

function subscribeToClientSnapshot() {
  return () => undefined;
}

function getEmptyClientSnapshot() {
  return "";
}

function getFalseClientSnapshot() {
  return false;
}
