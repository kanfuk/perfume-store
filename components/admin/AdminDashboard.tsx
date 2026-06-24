"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  BarChart3,
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
import { ProductImage } from "@/components/ProductImage";
import { WhatsAppFloatingButton } from "@/components/shared/WhatsAppFloatingButton";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import { formatCurrency } from "@/lib/format";
import { getUnifiedProductStock, normalizeStockValue } from "@/lib/stock";
import { buildAdminOrderAlertMessage } from "@/lib/whatsapp/buildAdminOrderAlertMessage";
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
type StockFilter = "todos" | "activos" | "sin-stock" | "pausados";
type CustomerFilter = "todos" | "con-pedidos" | "con-fiado" | "recientes";
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
  const [data, setData] = useState<AdminDashboardData>(initialData.dashboard);
  const [products, setProducts] = useState<AdminProductRecord[]>(initialData.productos);
  const [view, setView] = useState<AdminView>(initialView);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
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
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [todayDate, setTodayDate] = useState("");

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
            : stockFilter === "pausados"
              ? !product.activo
              : getUnifiedProductStock(product) <= 0;

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

  const pendingUnseenOrders = useMemo(
    () =>
      data.pendientes
        .filter((order) => order.adminSeen !== true)
        .sort((a, b) => b.fechaPedido.localeCompare(a.fechaPedido))
        .slice(0, 4),
    [data.pendientes]
  );

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

      return true;
    });
  }, [data.finalizados, reportFrom, reportTo]);

  const reportSummary = useMemo(() => {
    const totalVentas = reportOrders.reduce((sum, order) => sum + order.totalPagado, 0);
    const ticketPromedio = reportOrders.length > 0 ? totalVentas / reportOrders.length : 0;

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
      customer.total += order.totalPagado;
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
      ticketPromedio,
      totalPedidos: reportOrders.length,
      topProductos: Array.from(ventasPorProducto.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
      topClientes: Array.from(ventasPorCliente.values())
        .sort((a, b) => b.total - a.total)
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

  async function loadOrders() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/orders", { cache: "no-store" });
      const currentData = (await response.json()) as AdminDashboardData & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cargar pedidos.");
      }

      setData(currentData);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cargar pedidos."
      );
    } finally {
      setLoading(false);
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
    const notification = getOrderWhatsAppNotification(order, deliveryDateValue);

    if (notification.status !== "ready" || !notification.url) {
      setSuccessMessage(
        notification.error === "Sin telefono"
          ? "Pedido agendado, pero el cliente no tiene teléfono válido para WhatsApp."
          : "Pedido agendado, pero el teléfono del cliente no es válido para WhatsApp."
      );
      return;
    }

    const opened = window.open(notification.url, "_blank", "noopener,noreferrer");

    if (!opened) {
      setSuccessMessage(
        "Pedido agendado. Si WhatsApp no se abrio, usa el boton Enviar WhatsApp."
      );
      return;
    }

    setSuccessMessage("Pedido agendado correctamente.");
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
    try {
      setBusyOrderId(pedidoId);
      setError("");
      setSuccessMessage("");
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
        handleOrderAgendaWhatsApp(order, payload?.fechaEntrega);
      }
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible actualizar el pedido."
      );
    } finally {
      setBusyOrderId("");
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

  async function toggleProduct(product: AdminProductRecord) {
    try {
      setBusyProductId(product.id);
      setError("");
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "toggle",
          activo: !product.activo
        })
      });
      const currentData = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(currentData.error ?? "No fue posible cambiar el estado.");
      }

      await loadProducts();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cambiar el estado."
      );
    } finally {
      setBusyProductId("");
    }
  }

  async function saveStock(product: AdminProductRecord) {
    const draft = stockDrafts[product.id];

    await saveProduct({
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      precioVenta: Number(draft?.precioVenta ?? product.precioVenta),
      imageUrl: product.imageUrl,
      badgeLabel: product.badgeLabel,
      costoUnitario: product.costoUnitario,
      stock: normalizeStockValue(draft?.stock ?? getUnifiedProductStock(product)),
      tipoProducto: product.tipoProducto,
      activo: product.activo
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

  function openCustomerOrders(customer: CustomerCardData) {
    setSearch(customer.nombre);
    setStatusFilter("historial");
    navigateToView("agenda");
  }

  function openCustomerPayments(customer: CustomerCardData) {
    setSearch(customer.nombre);
    navigateToView("cobros");
  }

  const currentViewMeta = ADMIN_VIEW_META[view];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-5 overflow-x-hidden px-4 py-5 pb-[calc(88px+env(safe-area-inset-bottom))] sm:px-6">
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
            </div>
          </div>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            {view !== "home" ? (
              <button
                type="button"
                onClick={() => navigateToView("home")}
                className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-emerald-100 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-900 sm:px-4"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Inicio</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex min-h-11 items-center gap-2 rounded-[18px] border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900"
            >
              <RefreshCcw className="h-4 w-4" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={logout}
              className="min-h-11 rounded-[18px] border border-emerald-100 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900"
            >
              Cerrar sesión
            </button>
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
            badge={`${data.pedidosNuevos} nuevos`}
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
            badge={`${data.fiadosPendientes.length} fiados`}
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

      {view === "home" ? (
        <section className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <HeroMetric
              label="Pedidos nuevos"
              value={String(data.pedidosNuevos)}
              detail="Aún no marcados como vistos"
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
                  detail={`${data.pedidosNuevos} pedido(s) nuevos por revisar`}
                  icon={Clock3}
                  onClick={() => {
                    navigateToView("agenda");
                    setStatusFilter("pendientes");
                  }}
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
                    setStockFilter("sin-stock");
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
                <SimpleFact label="Ticket promedio" value={formatCurrency(reportSummary.ticketPromedio)} />
                <SimpleFact
                  label="Productos sin stock"
                  value={String(products.filter((product) => getUnifiedProductStock(product) <= 0).length)}
                />
              </div>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-[24px] border border-emerald-100 bg-white/95 p-5 shadow-soft lg:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-emerald-950">Pedidos nuevos</h2>
                  <p className="mt-1 text-sm text-emerald-900/65">
                    Lo ultimo que entro sin marcar como visto. Desde aqui puedes revisar, abrir agenda o compartir el resumen por WhatsApp.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigateToView("agenda");
                    setStatusFilter("pendientes");
                  }}
                  className="inline-flex min-h-11 items-center justify-center rounded-[18px] bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
                >
                  Abrir pedidos
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {pendingUnseenOrders.length === 0 ? (
                  <EmptyState text="No hay pedidos nuevos por revisar ahora mismo." />
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
                          navigateToView("agenda");
                          setStatusFilter("pendientes");
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
                badge={`${data.pendientes.length} por revisar`}
                icon={ClipboardList}
                tone="rose"
                onClick={() => navigateToView("agenda")}
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
                badge={`${data.fiadosPendientes.length} fiados`}
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
              value={`${ordersByFilter.pendientes.filter((order) => order.adminSeen !== true).length}/${ordersByFilter.pendientes.length}`}
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

          <section className="rounded-lg border border-emerald-100 bg-white/90 p-4 shadow-soft">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Search className="h-4 w-4" />
                  Buscar producto
                </span>
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Nombre, descripción o tipo"
                  className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 outline-none placeholder:text-emerald-400"
                />
              </label>

              <div className="space-y-2">
                <span className="text-sm font-semibold text-emerald-900">Filtro rápido</span>
                <StableHorizontalRail className="flex gap-2 overflow-x-auto">
                  <FilterChip
                    label="Activos"
                    active={stockFilter === "activos"}
                    onClick={() => setStockFilter("activos")}
                  />
                  <FilterChip
                    label="Sin stock"
                    active={stockFilter === "sin-stock"}
                    onClick={() => setStockFilter("sin-stock")}
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

          <div className="grid gap-4 lg:grid-cols-2">
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
                  onToggle={() => void toggleProduct(product)}
                  onEdit={() => setProductModalState({ mode: "edit", product })}
                  onDelete={() => void deleteProduct(product)}
                  onChange={(key, value) => updateStockDraft(product.id, key, value, product)}
                  onSave={() => void saveStock(product)}
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
              value={String(data.fiadosPendientes.length)}
              detail="Pedidos con saldo pendiente"
              icon={HandCoins}
              tone="amber"
            />
            <HeroMetric
              label="Saldo por cobrar"
              value={formatCurrency(
                data.fiadosPendientes.reduce((sum, order) => sum + order.saldoPendiente, 0)
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
                {data.fiadosPendientes.length === 0 ? (
                  <EmptyState text="No hay fiados pendientes ahora mismo." />
                ) : null}
                {data.fiadosPendientes.map((order) => (
                  <article
                    key={order.id}
                    className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-emerald-950">{order.clienteNombre}</div>
                          <div className="mt-1 text-sm text-emerald-900/65">
                            Saldo {formatCurrency(order.saldoPendiente)}
                          </div>
                        </div>
                        <StatusBadge tone="warning" label="FIADO" />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <MiniMetric label="Pedido" value={order.productoNombre} />
                        <MiniMetric
                          label="Último pago"
                          value={
                            order.fechaUltimoPago
                              ? formatShortDateTime(order.fechaUltimoPago)
                              : "Sin abonos"
                          }
                        />
                      </div>

                      <div className="space-y-2 rounded-xl border border-emerald-100 bg-white px-3 py-3">
                        {order.items.length > 0 ? (
                          order.items.map((item) => (
                            <div
                              key={`${order.id}-${item.productoId}`}
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

                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        onClick={() => setOrderModalState({ type: "abonar", order })}
                        className={buttonToneClass("warning")}
                      >
                        {busyOrderId === order.id ? "Procesando..." : "Registrar abono"}
                      </button>
                      <DebtCollectionButton order={order} />
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
            subtitle="Sólo los números importantes: ventas, ticket promedio y lo que mejor se vende."
            icon={CalendarRange}
            helper="Ideal para mirar cómo cerró la semana y que producto conviene reponer."
          />

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-emerald-100 bg-white/90 p-4 shadow-soft sm:p-5">
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <label className="min-w-0 max-w-full space-y-2 overflow-hidden">
                <span className="text-sm font-semibold text-emerald-900">Desde</span>
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                />
              </label>
              <label className="min-w-0 max-w-full space-y-2 overflow-hidden">
                <span className="text-sm font-semibold text-emerald-900">Hasta</span>
                <input
                  type="date"
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
                />
              </label>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              label="Ticket promedio"
              value={formatCurrency(reportSummary.ticketPromedio)}
              detail="Promedio por pedido"
              icon={Package2}
              tone="violet"
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
  onToggle,
  onEdit,
  onDelete,
  onChange,
  onSave
}: {
  product: AdminProductRecord;
  draft?: StockDraft;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (key: keyof StockDraft, value: string) => void;
  onSave: () => void;
}) {
  return (
    <article className="max-w-full overflow-x-hidden rounded-[24px] border border-emerald-100 bg-white/90 p-4 shadow-soft">
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
            <p className="text-sm leading-6 text-emerald-900/70">
              {product.descripcion || "Sin descripción."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2.5 text-sm font-semibold text-emerald-900"
        >
          <PencilLine className="h-4 w-4" />
          Editar
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={product.activo}
          disabled={busy}
          onClick={onToggle}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
            product.activo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              product.activo ? "bg-emerald-500" : "bg-slate-500"
            }`}
          />
          {busy ? "Guardando..." : product.activo ? "Catálogo activo" : "Pausado"}
        </button>
        <StatusBadge
          tone="neutral"
          label={product.badgeLabel || product.tipoProducto || "PRODUCTO CASERO"}
        />
        <StatusBadge
          tone={getUnifiedProductStock(product) > 0 ? "pedido" : "warning"}
          label={`Stock ${getUnifiedProductStock(product)}`}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InlineField
          label="Precio"
          value={draft?.precioVenta ?? String(product.precioVenta)}
          onChange={(value) => onChange("precioVenta", value)}
        />
        <InlineField
          label="Stock"
          value={draft?.stock ?? String(getUnifiedProductStock(product))}
          onChange={(value) => onChange("stock", value)}
        />
      </div>

      <details className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-3">
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
    <section className="rounded-lg border border-emerald-100 bg-white/90 p-5 shadow-soft">
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
  onSave
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

          <div className="min-h-0 overflow-y-auto px-5 py-5 pb-[calc(128px+env(safe-area-inset-bottom))]">
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

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              <div>
                <div className="font-semibold text-emerald-950">Disponible para clientes</div>
                <div className="mt-1 text-xs text-emerald-900/65">
                  Apágalo cuando no quieras vender este producto.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivo((currentValue) => !currentValue)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                  activo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    activo ? "bg-emerald-500" : "bg-slate-500"
                  }`}
                />
                {activo ? "Activo" : "Pausado"}
              </button>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-emerald-900">Nombre</span>
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
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
              value={badgeLabel}
              onChange={(event) => setBadgeLabel(event.target.value)}
              placeholder="Ejemplo: DOBLADITA QUESO"
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
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
              type="number"
              min={0}
              value={precioVenta}
              onChange={(event) => setPrecioVenta(event.target.value)}
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
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
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-emerald-900">Tipo</span>
            <input
              value={tipoProducto}
              onChange={(event) => setTipoProducto(event.target.value)}
              className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
            />
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
    <label className="space-y-2">
      <span className="text-sm font-semibold text-emerald-900">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
      />
    </label>
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
      amount: order.saldoPendiente > 0 ? order.saldoPendiente : order.total,
      items: order.items.map((item) => ({
        name: item.productoNombre,
        quantity: item.cantidad
      }))
    })
  );
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
