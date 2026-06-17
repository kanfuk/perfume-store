"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
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
  Package2,
  PencilLine,
  Phone,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  WalletCards
} from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { ProductImage } from "@/components/ProductImage";
import { formatCurrency } from "@/lib/format";
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
  stockActual: string;
  stockAgenda: string;
  precioVenta: string;
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
              : product.stockActual <= 0;

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
        orders: []
      };

      current.totalPedidos += 1;
      current.totalItems += order.cantidad;
      current.totalMonto += order.total;
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
    const stockAgendaTotal = productosActivos.reduce(
      (sum, product) => sum + product.stockAgenda,
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
      stockAgendaTotal,
      saldoPorCobrar,
      ventasCerradas: data.finalizados.reduce((sum, order) => sum + order.totalPagado, 0)
    };
  }, [data, products, todayDate]);

  const customerCards = useMemo(() => {
    const grouped = new Map<
      string,
      {
        clienteId: string;
        nombre: string;
        telefono: string;
        lugarTrabajo: string;
        pedidos: number;
        pendiente: number;
        ultimoMovimiento: string;
        proximasFechas: string[];
      }
    >();

    allOrders.forEach((order) => {
      const customerKey = buildCustomerIdentityKey(order);
      const current = grouped.get(customerKey) ?? {
        clienteId: order.clienteId,
        nombre: order.clienteNombre,
        telefono: order.clienteTelefono,
        lugarTrabajo: order.clienteLugarTrabajo,
        pedidos: 0,
        pendiente: 0,
        ultimoMovimiento: order.fechaPedido,
        proximasFechas: []
      };

      current.pedidos += 1;
      current.pendiente += order.saldoPendiente;
      current.ultimoMovimiento =
        current.ultimoMovimiento > order.fechaPedido
          ? current.ultimoMovimiento
          : order.fechaPedido;

      if (order.fechaEntrega && !current.proximasFechas.includes(order.fechaEntrega)) {
        current.proximasFechas.push(order.fechaEntrega);
      }

      grouped.set(customerKey, current);
    });

    return Array.from(grouped.values()).sort((a, b) =>
      b.ultimoMovimiento.localeCompare(a.ultimoMovimiento)
    );
  }, [allOrders]);

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
        ? "Esto archivara toda la operacion actual y dejara pedidos, pagos, fiados y clientes en blanco. Productos y stock se conservan. Continúo?"
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

  async function runAction(
    pedidoId: string,
    action: AdminOrdersAction,
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
    stockActual: number;
    stockAgenda: number;
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
      stockActual: Number(draft?.stockActual ?? product.stockActual),
      stockAgenda: Number(draft?.stockAgenda ?? product.stockAgenda),
      tipoProducto: product.tipoProducto,
      activo: product.activo
    });
  }

  async function deleteProduct(product: AdminProductRecord) {
    const confirmed = window.confirm(
      `Eliminar "${product.nombre}" del catalogo? Si ya tiene pedidos asociados, el sistema no lo dejara borrar y tendras que dejarlo pausado.`
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
        stockActual: current[productId]?.stockActual ?? String(product.stockActual),
        stockAgenda: current[productId]?.stockAgenda ?? String(product.stockAgenda),
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

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col gap-5 overflow-x-hidden px-4 py-5 pb-28 sm:px-6">
      <section className="max-w-full overflow-x-hidden rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800">
              <Store className="h-4 w-4" />
              Panel admin
            </span>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-rose-950">Centro de control</h1>
              <p className="max-w-3xl text-sm leading-6 text-rose-900/70">
                Todo lo importante de Pauli Store en pocas acciones: revisar pedidos,
                abrir stock, cobrar y cerrar el dia sin perderte.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {view !== "home" ? (
              <button
                type="button"
                onClick={() => navigateToView("home")}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Inicio
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-900"
            >
              <RefreshCcw className="h-4 w-4" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={logout}
              className="min-h-11 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900"
            >
              Cerrar sesion
            </button>
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-20 max-w-full overflow-x-hidden rounded-lg border border-rose-200 bg-white/95 p-3 shadow-soft backdrop-blur">
        <div className="flex gap-2 overflow-x-auto pb-1">
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
            badge={`${data.pendientes.length} pendientes`}
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
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
              label="Pendientes"
              value={String(homeSummary.pendientes)}
              detail="Pedidos esperando revision"
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
            <article className="rounded-[24px] border border-rose-200 bg-white/95 p-5 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-rose-100 p-3 text-rose-700">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-rose-950">Lo de hoy</h2>
                  <p className="text-sm text-rose-900/65">
                    Tres decisiones y listo.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <QuickTaskRow
                  title="Revisar pendientes"
                  detail={`${data.pendientes.length} pedido(s) esperando respuesta`}
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
                  detail={`${products.filter((product) => product.stockActual <= 0).length} producto(s) sin stock hoy`}
                  icon={Boxes}
                  onClick={() => {
                    navigateToView("stock");
                    setStockFilter("sin-stock");
                  }}
                />
              </div>
            </article>

            <article className="rounded-[24px] border border-rose-200 bg-white/95 p-5 shadow-soft">
              <div className="flex items-center gap-3">
                <span className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                  <BarChart3 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-rose-950">Cierre rapido</h2>
                  <p className="text-sm text-rose-900/65">
                    Numeros puntuales del negocio.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <SimpleFact label="Ventas del rango" value={formatCurrency(reportSummary.totalVentas)} />
                <SimpleFact label="Ticket promedio" value={formatCurrency(reportSummary.ticketPromedio)} />
                <SimpleFact
                  label="Productos sin stock"
                  value={String(products.filter((product) => product.stockActual <= 0).length)}
                />
              </div>
            </article>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <FocusCard
              title="Lo primero hoy"
              text="Revisa pedidos pendientes y asígnales fecha antes de todo."
              icon={AlertCircle}
              tone="rose"
            />
            <FocusCard
              title="Después cobra"
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

          <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-rose-950">Atajos principales</h2>
              <p className="text-sm text-rose-900/70">
                Entra directo a lo que mas usa Pauli en el dia a dia.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <HomeActionCard
                title="Agenda"
                subtitle="Revisar pendientes, agendar fechas y ver pedidos del dia."
                badge={`${data.pendientes.length} por revisar`}
                icon={ClipboardList}
                tone="rose"
                onClick={() => navigateToView("agenda")}
              />
              <HomeActionCard
                title="Stock"
                subtitle="Crear productos, abrir o pausar catalogo y ajustar cupos."
                badge={`${homeSummary.productosActivos} activos`}
                icon={Boxes}
                tone="violet"
                onClick={() => navigateToView("stock")}
              />
              <HomeActionCard
                title="Ventas"
                subtitle="Marcar pagado, dejar fiado y registrar abonos facilmente."
                badge={`${data.fiadosPendientes.length} fiados`}
                icon={WalletCards}
                tone="amber"
                onClick={() => navigateToView("cobros")}
              />
              <HomeActionCard
                title="Clientes"
                subtitle="Ver quienes compran seguido y sus fechas mas recientes."
                badge={`${customerCards.length} registros`}
                icon={UserRound}
                tone="emerald"
                onClick={() => navigateToView("clientes")}
              />
              <HomeActionCard
                title="Reportes"
                subtitle="Ventas por rango de fechas, top productos y top clientes."
                badge="Resumen rapido"
                icon={CalendarRange}
                tone="slate"
                onClick={() => navigateToView("reportes")}
              />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
              <div className="flex items-center gap-2 text-rose-950">
                <Sparkles className="h-5 w-5" />
                <h3 className="text-lg font-bold">Agenda agrupada</h3>
              </div>
              <p className="mt-1 text-sm text-rose-900/70">
                Si una misma persona pidio varias veces para el mismo dia, aqui aparece todo junto.
              </p>

              <div className="mt-4 space-y-3">
                {agendaGroups.length === 0 ? (
                  <EmptyState text="Todavia no hay pedidos agendados." />
                ) : null}
                {agendaGroups.slice(0, 4).map((group) => (
                  <article
                    key={group.key}
                    className="rounded-lg border border-rose-200 bg-rose-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-rose-950">{group.clienteNombre}</div>
                        <div className="mt-1 text-sm text-rose-900/65">
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
                      <MiniMetric label="Telefono" value={group.clienteTelefono || "-"} />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
              <div className="flex items-center gap-2 text-rose-950">
                <Store className="h-5 w-5" />
                <h3 className="text-lg font-bold">Resumen al grano</h3>
              </div>
              <div className="mt-4 space-y-3">
                <SimpleFact
                  label="Productos activos"
                  value={`${homeSummary.productosActivos}`}
                />
                <SimpleFact
                  label="Stock agenda total"
                  value={`${homeSummary.stockAgendaTotal}`}
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
            helper="Paso 1: entra aqui varias veces al dia. Lo pendiente arriba, el detalle al costado."
          />

          <div className="grid gap-4 rounded-lg border border-rose-200 bg-white/90 p-4 shadow-soft lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                <Search className="h-4 w-4" />
                Buscar pedido
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, telefono, producto o fecha"
                className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 outline-none placeholder:text-rose-400"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-rose-900">Vista</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
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

                      void runAction(order.id, action);
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
              <aside className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft xl:sticky xl:top-5 xl:h-fit">
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
            subtitle="Crea productos, cambia precio, activa o pausa ventas y define cupo de agenda."
            icon={Boxes}
            helper="Paso 2: deja aqui lo que sí vas a vender y el cupo maximo para no sobreagendar."
            action={
              <button
                type="button"
                onClick={() => setProductModalState({ mode: "create" })}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Nuevo producto
              </button>
            }
          />

          <section className="rounded-lg border border-rose-200 bg-white/90 p-4 shadow-soft">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                  <Search className="h-4 w-4" />
                  Buscar producto
                </span>
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Nombre, descripcion o tipo"
                  className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 outline-none placeholder:text-rose-400"
                />
              </label>

              <div className="space-y-2">
                <span className="text-sm font-semibold text-rose-900">Filtro rapido</span>
                <div className="flex gap-2 overflow-x-auto">
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
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <HeroMetric
              label="Catalogo activo"
              value={String(products.filter((product) => product.activo).length)}
              detail="Productos visibles para clientes"
              icon={CheckCircle2}
              tone="emerald"
            />
            <HeroMetric
              label="Pausados"
              value={String(products.filter((product) => !product.activo).length)}
              detail="Productos fuera del catalogo"
              icon={Package2}
              tone="violet"
            />
            <HeroMetric
              label="Sin stock hoy"
              value={String(products.filter((product) => product.stockActual <= 0).length)}
              detail="Revisar antes de abrir ventas"
              icon={AlertCircle}
              tone="amber"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {catalogLoading ? <EmptyState text="Cargando catalogo..." /> : null}
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
            subtitle="Desde aqui se ve clarito que pedidos cobrar, cuales dejar fiados y donde registrar abonos."
            icon={WalletCards}
            helper="Paso 3: al entregar, marca pagado o fiado. Si te pagan después, registra el abono aqui."
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
            <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-rose-950">Cerrar pedidos agendados</h2>
                <p className="text-sm text-rose-900/70">
                  Marca rapido como pagado o fiado.
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

            <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-rose-950">Fiados pendientes</h2>
                <p className="text-sm text-rose-900/70">
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
                    className="rounded-lg border border-rose-200 bg-rose-50/60 p-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-rose-950">{order.clienteNombre}</div>
                          <div className="mt-1 text-sm text-rose-900/65">
                            Saldo {formatCurrency(order.saldoPendiente)}
                          </div>
                        </div>
                        <StatusBadge tone="warning" label="FIADO" />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <MiniMetric label="Pedido" value={order.productoNombre} />
                        <MiniMetric
                          label="Ultimo pago"
                          value={
                            order.fechaUltimoPago
                              ? formatShortDateTime(order.fechaUltimoPago)
                              : "Sin abonos"
                          }
                        />
                      </div>

                      <button
                        type="button"
                        disabled={busyOrderId === order.id}
                        onClick={() => setOrderModalState({ type: "abonar", order })}
                        className={buttonToneClass("warning")}
                      >
                        {busyOrderId === order.id ? "Procesando..." : "Registrar abono"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
            <div className="flex items-center gap-2 text-rose-950">
              <Archive className="h-5 w-5" />
              <h3 className="text-lg font-bold">Cierre y limpieza</h3>
            </div>
            <p className="copy-justified mt-3 text-sm leading-6 text-rose-900/70">
              Usa cierre de mes cuando ya no queden pedidos pendientes ni agendados y
              quieras archivar la operacion completa del periodo. Usa limpieza de prueba
              antes del lanzamiento publico para borrar solo la data simulada operativa.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
                <h4 className="text-base font-semibold text-rose-950">Cierre de mes</h4>
                <p className="copy-justified mt-2 text-sm leading-6 text-rose-900/70">
                  Archiva pedidos, items, pagos, fiados y clientes en un log historico y
                  deja limpio el panel operativo. Conserva productos y stock.
                </p>
                <button
                  type="button"
                  disabled={busyMaintenanceAction !== ""}
                  onClick={() => void runMaintenanceAction("close-month")}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
                >
                  <Archive className="h-4 w-4" />
                  {busyMaintenanceAction === "close-month"
                    ? "Cerrando..."
                    : "Cerrar mes"}
                </button>
              </article>

              <article className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <h4 className="text-base font-semibold text-amber-900">
                  Limpiar datos de prueba
                </h4>
                <p className="copy-justified mt-2 text-sm leading-6 text-amber-900/80">
                  Borra la operacion simulada del panel antes del lanzamiento publico.
                  No toca productos, precios ni stock actual.
                </p>
                <button
                  type="button"
                  disabled={busyMaintenanceAction !== ""}
                  onClick={() => void runMaintenanceAction("clear-test-data")}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  {busyMaintenanceAction === "clear-test-data"
                    ? "Limpiando..."
                    : "Limpiar prueba"}
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
            helper="Sirve para ubicar rapido a cada cliente antes de confirmar o cobrar."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customerCards.length === 0 ? (
              <EmptyState text="Todavia no hay clientes registrados." />
            ) : null}
            {customerCards.map((customer) => (
              <article
                key={customer.clienteId}
                className="rounded-lg border border-rose-200 bg-white/90 p-4 shadow-soft"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-rose-950">{customer.nombre}</h3>
                      <p className="mt-1 text-sm text-rose-900/65">{customer.lugarTrabajo}</p>
                    </div>
                    <StatusBadge tone="neutral" label={`${customer.pedidos} pedido(s)`} />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-rose-900/70">
                    <Phone className="h-4 w-4" />
                    {customer.telefono || "Sin telefono"}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <MiniMetric
                      label="Saldo pendiente"
                      value={formatCurrency(customer.pendiente)}
                    />
                    <MiniMetric
                      label="Ultimo movimiento"
                      value={formatShortDateTime(customer.ultimoMovimiento)}
                    />
                  </div>

                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-rose-700/70">
                      Fechas agendadas
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {customer.proximasFechas.length === 0 ? (
                        <span className="text-sm text-rose-900/55">Sin fechas activas</span>
                      ) : (
                        customer.proximasFechas.slice(0, 4).map((fecha) => (
                          <span
                            key={`${customer.clienteId}-${fecha}`}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-800"
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
            subtitle="Solo los numeros importantes: ventas, ticket promedio y lo que mejor se vende."
            icon={CalendarRange}
            helper="Ideal para mirar cómo cerró la semana y que producto conviene reponer."
          />

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-rose-200 bg-white/90 p-4 shadow-soft sm:p-5">
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <label className="min-w-0 max-w-full space-y-2 overflow-hidden">
                <span className="text-sm font-semibold text-rose-900">Desde</span>
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
                />
              </label>
              <label className="min-w-0 max-w-full space-y-2 overflow-hidden">
                <span className="text-sm font-semibold text-rose-900">Hasta</span>
                <input
                  type="date"
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                  className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
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
            <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
              <div className="flex items-center gap-2 text-rose-950">
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
                    className="rounded-lg border border-rose-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-rose-950">{item.nombre}</div>
                        <div className="text-sm text-rose-900/65">
                          {item.unidades} unidades
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-rose-700">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
              <div className="flex items-center gap-2 text-rose-950">
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
                    className="rounded-lg border border-rose-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-rose-950">{item.nombre}</div>
                        <div className="text-sm text-rose-900/65">
                          {item.pedidos} pedido(s)
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-rose-700">
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
            void runAction(orderModalState.order.id, orderModalState.type, payload)
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
      <MobileAdminNav currentView={view} onChange={navigateToView} />
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
    <section className="max-w-full overflow-x-hidden rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-2xl bg-rose-100 p-3 text-rose-700">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-2xl font-bold text-rose-950">{title}</h2>
            <p className="copy-justified break-words text-sm text-rose-900/70">
              {subtitle}
            </p>
            {helper ? (
              <p className="copy-justified break-words rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
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
          gradientClass: "from-rose-50 to-white",
          iconTextClass: "text-rose-700",
          iconBgClass: "bg-rose-100"
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
      className={`max-w-full overflow-x-hidden rounded-lg border border-rose-200 bg-gradient-to-br ${palette.gradientClass} p-4 text-left shadow-soft transition hover:border-rose-300`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-2xl p-3 ${palette.iconBgClass} ${palette.iconTextClass}`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-800">
          {badge}
        </span>
      </div>
      <div className="mt-4 min-w-0 space-y-2">
        <div className="break-words text-lg font-semibold text-rose-950">{title}</div>
        <p className="copy-justified break-words text-sm leading-6 text-rose-900/70">
          {subtitle}
        </p>
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-rose-800">
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
      className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-4 text-left transition hover:border-rose-300 sm:flex-nowrap"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-2xl bg-white p-3 text-rose-700 shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-rose-950">{title}</div>
          <div className="copy-justified mt-1 break-words text-xs text-rose-900/65">
            {detail}
          </div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-rose-500" />
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
      className={`min-w-[132px] rounded-2xl border px-4 py-3 text-left transition sm:min-w-[146px] ${
        active
          ? "border-rose-300 bg-rose-600 text-white"
          : "border-rose-200 bg-rose-50 text-rose-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-2xl p-2 ${
            active ? "bg-white/20 text-white" : "bg-white text-rose-700"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3">
        <div className="text-sm font-semibold">{label}</div>
        <div className={`mt-1 text-xs ${active ? "text-white/80" : "text-rose-700/80"}`}>
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
      className={`min-h-11 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
        active ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-800"
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
    <article className="max-w-full overflow-x-hidden rounded-[24px] border border-rose-200 bg-white/90 p-4 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[20px] border border-rose-100 bg-rose-50">
            <ProductImage
              src={product.imageUrl ?? "/images/products/dobladita-reserva-ave-pimenton.jpeg"}
              alt={product.nombre}
              sizes="96px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-lg font-semibold text-rose-950">{product.nombre}</h3>
              <StatusBadge
                tone={product.activo ? "pedido" : "neutral"}
                label={product.activo ? "ACTIVO" : "PAUSADO"}
              />
            </div>
            <p className="text-sm leading-6 text-rose-900/70">
              {product.descripcion || "Sin descripcion."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-sm font-semibold text-rose-900"
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
          {busy ? "Guardando..." : product.activo ? "Catalogo activo" : "Pausado"}
        </button>
        <StatusBadge
          tone="neutral"
          label={product.badgeLabel || product.tipoProducto || "PRODUCTO CASERO"}
        />
        <StatusBadge
          tone={product.stockActual > 0 ? "pedido" : "warning"}
          label={`Stock hoy ${product.stockActual}`}
        />
        <StatusBadge
          tone={product.stockAgenda > 0 ? "neutral" : "warning"}
          label={`Agenda ${product.stockAgenda}`}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <InlineField
          label="Precio"
          value={draft?.precioVenta ?? String(product.precioVenta)}
          onChange={(value) => onChange("precioVenta", value)}
        />
        <InlineField
          label="Stock hoy"
          value={draft?.stockActual ?? String(product.stockActual)}
          onChange={(value) => onChange("stockActual", value)}
        />
        <InlineField
          label="Stock agenda"
          value={draft?.stockAgenda ?? String(product.stockAgenda)}
          onChange={(value) => onChange("stockAgenda", value)}
        />
      </div>

      <details className="mt-4 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-rose-900">
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
        <div className="min-w-0 break-words text-sm text-rose-900/60">
          Ajusta aqui lo rapido. Editar abre el detalle completo.
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700"
          >
            <Trash2 className="h-4 w-4" />
            {busy ? "Procesando..." : "Eliminar"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white"
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
    <section className="rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-rose-950">{title}</h2>
        <p className="text-sm text-rose-900/70">{subtitle}</p>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? <EmptyState text="Cargando pedidos..." /> : null}
        {!loading && orders.length === 0 ? <EmptyState text={emptyText} /> : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className={`rounded-lg border p-4 ${
              selectedOrderId === order.id
                ? "border-rose-400 bg-rose-50"
                : "border-rose-200 bg-white"
            }`}
          >
            <button type="button" onClick={() => onSelect(order.id)} className="w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-rose-950">
                      {order.clienteNombre}
                    </h3>
                    {order.fechaEntrega ? (
                      <StatusBadge
                        tone="neutral"
                        label={`Entrega ${formatDateOnly(order.fechaEntrega)}`}
                      />
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-rose-900/65">
                    <Phone className="h-4 w-4" />
                    {order.clienteTelefono || "Sin telefono"}
                  </div>
                  <div className="text-sm text-rose-900/65">
                    {order.items.length > 1
                      ? `${order.items.length} productos en el pedido`
                      : order.productoNombre}
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

              {selectedOrderId === order.id ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-3 xl:hidden">
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
                          <div className="text-sm font-semibold text-rose-950">
                            {item.productoNombre}
                          </div>
                          <div className="text-xs text-rose-900/65">
                            {item.cantidad} x {formatCurrency(item.precioUnitario)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-rose-700">
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
                    disabled={busyOrderId === order.id}
                    onClick={() => onAction(order, action.key)}
                    className={`${buttonToneClass(action.tone)} w-full justify-center sm:w-auto`}
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
          <h2 className="text-xl font-bold text-rose-950">{order.clienteNombre}</h2>
          <StatusBadge tone="pedido" label={order.estadoPedido} />
          <StatusBadge
            tone={order.estadoPago === "FIADO" ? "warning" : "neutral"}
            label={order.estadoPago}
          />
        </div>
        <div className="text-sm text-rose-900/70">
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
        <MiniMetric label="Pagado" value={formatCurrency(order.totalPagado)} />
        <MiniMetric label="Saldo" value={formatCurrency(order.saldoPendiente)} />
      </div>

      <section className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-rose-700/70">
          Productos
        </div>
        <div className="mt-3 space-y-3">
          {order.items.map((item) => (
            <div
              key={`${order.id}-${item.productoId}`}
              className="rounded-lg border border-rose-200 bg-white p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-rose-950">{item.productoNombre}</div>
                  <div className="text-sm text-rose-900/65">
                    {formatCurrency(item.precioUnitario)} x {item.cantidad}
                  </div>
                </div>
                <div className="text-sm font-semibold text-rose-700">
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
    <article className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold text-rose-950">{order.clienteNombre}</div>
            <div className="mt-1 text-sm text-rose-900/65">{order.productoNombre}</div>
          </div>
          <StatusBadge
            tone="neutral"
            label={order.fechaEntrega ? formatDateOnly(order.fechaEntrega) : "Sin fecha"}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <MiniMetric label="Total" value={formatCurrency(order.total)} />
          <MiniMetric label="Telefono" value={order.clienteTelefono || "-"} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/35 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-[20px] border border-rose-200 bg-white p-5 shadow-soft">
        <div className="space-y-1">
          <div className="inline-flex rounded-2xl bg-rose-100 p-3 text-rose-700">
            {state.type === "agendar" ? (
              <CalendarClock className="h-5 w-5" />
            ) : state.type === "cancelar" ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <HandCoins className="h-5 w-5" />
            )}
          </div>
          <h3 className="pt-2 text-xl font-bold text-rose-950">
            {state.type === "agendar"
              ? "Agendar pedido"
              : state.type === "cancelar"
                ? "Cancelar pedido"
                : "Registrar abono"}
          </h3>
          <p className="text-sm text-rose-900/70">{state.order.clienteNombre}</p>
        </div>

        <div className="mt-4 space-y-4">
          {state.type === "agendar" ? (
            <label className="block min-w-0 max-w-full space-y-2 overflow-hidden">
              <span className="text-sm font-semibold text-rose-900">Fecha de entrega</span>
              <input
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
                className="block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-[16px] text-rose-950"
              />
            </label>
          ) : null}

          {state.type === "cancelar" ? (
            <label className="space-y-2">
              <span className="text-sm font-semibold text-rose-900">Motivo</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
              />
            </label>
          ) : null}

          {state.type === "abonar" ? (
            <>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-rose-900">Monto abonado</span>
                <input
                  type="number"
                  min={1}
                  max={state.order.saldoPendiente}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-rose-900">Metodo de pago</span>
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
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
            className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-900"
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
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
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
    stockActual: number;
    stockAgenda: number;
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
  const [stockActual, setStockActual] = useState(String(current?.stockActual ?? 0));
  const [stockAgenda, setStockAgenda] = useState(String(current?.stockAgenda ?? 0));
  const [tipoProducto, setTipoProducto] = useState(current?.tipoProducto ?? "simple");
  const [activo, setActivo] = useState(current?.activo ?? true);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-rose-950/35 px-3 py-4 sm:px-4">
      <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
        <div className="w-full max-h-[92vh] overflow-y-auto rounded-[24px] border border-rose-200 bg-white shadow-soft">
          <div className="sticky top-0 z-10 border-b border-rose-100 bg-white/95 px-5 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex rounded-2xl bg-rose-100 p-3 text-rose-700">
                  <Package2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-rose-950">
                    {state.mode === "create" ? "Nuevo producto" : "Editar producto"}
                  </h3>
                  <p className="text-sm text-rose-900/70">
                    Ajusta catalogo, stock y precio sin perderte en el celular.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-900"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5">
            <section className="grid gap-3 sm:grid-cols-3">
              <MiniMetric
                label="Catalogo"
                value={activo ? "Activo" : "Pausado"}
              />
              <MiniMetric label="Stock hoy" value={stockActual} />
              <MiniMetric
                label="Badge"
                value={badgeLabel || tipoProducto || "PRODUCTO CASERO"}
              />
            </section>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-900">
              <div>
                <div className="font-semibold text-rose-950">Disponible para clientes</div>
                <div className="mt-1 text-xs text-rose-900/65">
                  Apagalo cuando no quieras vender este producto.
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
            <span className="text-sm font-semibold text-rose-900">Nombre</span>
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-rose-900">Descripcion corta</span>
            <textarea
              value={descripcion}
              onChange={(event) => setDescripcion(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-rose-900">Badge visible</span>
            <input
              value={badgeLabel}
              onChange={(event) => setBadgeLabel(event.target.value)}
              placeholder="Ejemplo: DOBLADITA QUESO"
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-rose-900">Ruta publica de imagen</span>
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="/images/products/dobladita-solo-queso.jpeg"
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-rose-900">Precio</span>
            <input
              type="number"
              min={0}
              value={precioVenta}
              onChange={(event) => setPrecioVenta(event.target.value)}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-rose-900">Costo</span>
            <input
              type="number"
              min={0}
              value={costoUnitario}
              onChange={(event) => setCostoUnitario(event.target.value)}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-rose-900">Stock hoy</span>
            <input
              type="number"
              min={0}
              value={stockActual}
              onChange={(event) => setStockActual(event.target.value)}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-rose-900">Stock agenda</span>
            <input
              type="number"
              min={0}
              value={stockAgenda}
              onChange={(event) => setStockAgenda(event.target.value)}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-rose-900">Tipo</span>
            <input
              value={tipoProducto}
              onChange={(event) => setTipoProducto(event.target.value)}
              className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
            />
          </label>
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-rose-100 bg-white/95 px-5 py-4 backdrop-blur">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-900"
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
                  stockActual: Number(stockActual),
                  stockAgenda: Number(stockAgenda),
                  tipoProducto,
                  activo
                })
              }
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {busy ? "Guardando..." : "Guardar producto"}
            </button>
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
          gradientClass: "from-white to-rose-50",
          iconBgClass: "bg-rose-100",
          iconTextClass: "text-rose-700"
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
      className={`max-w-full overflow-x-hidden rounded-lg border border-rose-200 bg-gradient-to-br ${palette.gradientClass} p-5 shadow-soft`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-rose-900/65">{label}</div>
          <div className="mt-2 break-words text-3xl font-bold text-rose-950">{value}</div>
        </div>
        <span
          className={`rounded-2xl p-3 shadow-sm ${palette.iconBgClass} ${palette.iconTextClass}`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-3 break-words text-sm text-rose-900/65">{detail}</p>
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
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "violet"
        ? "border-violet-200 bg-violet-50 text-violet-800"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <article className={`max-w-full overflow-x-hidden rounded-lg border p-4 shadow-soft ${className}`}>
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
        ? "bg-rose-600 text-white"
        : "bg-rose-50 text-rose-800"
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
      className={`min-w-0 rounded-lg px-4 py-4 text-left shadow-soft transition ${palette}`}
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
    <details className="max-w-full overflow-x-hidden rounded-lg border border-rose-200 bg-white/90 p-5 shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-bold text-rose-950">{title}</h2>
          <p className="break-words text-sm text-rose-900/70">{subtitle}</p>
        </div>
        <StatusBadge tone="neutral" label={`${orders.length} registro(s)`} />
      </summary>

      <div className="mt-4 space-y-3">
        {orders.length === 0 ? <EmptyState text={emptyText} /> : null}
        {orders.map((order) => (
          <article
            key={order.id}
            className="rounded-lg border border-rose-200 bg-rose-50/60 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-rose-950">{order.clienteNombre}</div>
                <div className="mt-1 text-sm text-rose-900/65">{order.productoNombre}</div>
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-4 py-3">
      <span className="text-sm text-rose-900/70">{label}</span>
      <span className="text-base font-semibold text-rose-950">{value}</span>
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
      <span className="text-sm font-semibold text-rose-900">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950"
      />
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-rose-700/70">{label}</div>
      <div className="mt-1 text-sm font-semibold text-rose-950">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-rose-200 bg-rose-50/50 p-4 text-sm text-rose-900/60">
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
      ? "bg-rose-100 text-rose-800"
      : tone === "warning"
        ? "bg-amber-100 text-amber-800"
        : "bg-violet-100 text-violet-800";

  return (
    <span
      className={`inline-flex max-w-full items-center justify-center rounded-full px-3 py-1 text-center text-xs font-semibold leading-4 ${classes}`}
    >
      {label}
    </span>
  );
}

function formatShortDateTime(value: string) {
  return formatChileDateTime(value);
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

function todayDateValue() {
  return getChileTodayInputValue();
}

function buttonToneClass(tone: "primary" | "warning" | "muted") {
  if (tone === "primary") {
    return "inline-flex min-h-11 items-center rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm";
  }

  if (tone === "warning") {
    return "inline-flex min-h-11 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800";
  }

  return "inline-flex min-h-11 items-center rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-900";
}

function MobileAdminNav({
  currentView,
  onChange
}: {
  currentView: AdminView;
  onChange: (view: AdminView) => void;
}) {
  const items: Array<{
    value: AdminView;
    label: string;
    icon: typeof LayoutGrid;
  }> = [
    { value: "home", label: "Inicio", icon: Home },
    { value: "agenda", label: "Pedidos", icon: ClipboardList },
    { value: "stock", label: "Stock", icon: Boxes },
    { value: "cobros", label: "Ventas", icon: WalletCards },
    { value: "clientes", label: "Clientes", icon: UserRound },
    { value: "reportes", label: "Reportes", icon: BarChart3 }
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-rose-200 bg-white/95 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(95,48,65,0.08)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = currentView === item.value;

          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${
                active ? "bg-rose-100 text-rose-800" : "text-rose-500"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
