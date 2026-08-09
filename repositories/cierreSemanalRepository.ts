/**
 * Proyecto: Perfume Store
 * Modulo: Repositorio de Cierres Semanales (Fase 7.6A)
 * Descripcion: Acceso a cierres semanales desde memoria local o Supabase.
 * La version Supabase delega la atomicidad (version + duplicado) a las RPC
 * create_weekly_closure_v1 / reopen_weekly_closure_v1 (migracion
 * 20260810000000_smellme_weekly_admin_closures.sql); la version en memoria
 * reproduce la misma logica en TypeScript
 * unicamente para pruebas y desarrollo local sin Supabase configurado.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { CierreSemanal, CierreSemanalMetrics, EstadoCierreSemanal } from "@/domain/CierreSemanal";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore, LocalWeeklyClosureRecord } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapWeeklyClosureRpcError } from "@/lib/weeklyClosureErrors";

export type AdminIdentidad = {
  email?: string | null;
  nombre?: string | null;
};

export type CrearCierreSemanalInput = {
  periodStart: Date;
  periodEndExclusive: Date;
  metrics: CierreSemanalMetrics;
  snapshot: Record<string, unknown>;
  admin: AdminIdentidad;
};

export type ReabrirCierreSemanalInput = {
  closureId: string;
  reason: string;
  admin: AdminIdentidad;
};

export type ListarCierresSemanalesParams = {
  limit: number;
  offset: number;
};

export type ListarCierresSemanalesResult = {
  items: CierreSemanal[];
  total: number;
};

export interface CierreSemanalRepository {
  listarCierres(params: ListarCierresSemanalesParams): Promise<ListarCierresSemanalesResult>;
  obtenerCierrePorId(id: string): Promise<CierreSemanal | null>;
  obtenerCierreActivoPorPeriodo(periodStart: Date, periodEndExclusive: Date): Promise<CierreSemanal | null>;
  crearCierre(input: CrearCierreSemanalInput): Promise<CierreSemanal>;
  reabrirCierre(input: ReabrirCierreSemanalInput): Promise<CierreSemanal>;
}

function metricsToRecordFields(metrics: CierreSemanalMetrics) {
  return {
    ordersCount: metrics.ordersCount,
    cancelledOrdersCount: metrics.cancelledOrdersCount,
    pendingOrdersCount: metrics.pendingOrdersCount,
    deliveredOrdersCount: metrics.deliveredOrdersCount,
    directSalesCount: metrics.directSalesCount,
    grossSales: metrics.grossSales,
    incomeAmount: metrics.incomeAmount,
    costAmount: metrics.costAmount,
    profitAmount: metrics.profitAmount,
    outstandingAmount: metrics.outstandingAmount
  };
}

function localRecordToCierreSemanal(record: LocalWeeklyClosureRecord): CierreSemanal {
  return new CierreSemanal({
    id: record.id,
    periodStart: new Date(record.periodStart),
    periodEndExclusive: new Date(record.periodEndExclusive),
    version: record.version,
    status: record.status,
    ordersCount: record.ordersCount,
    cancelledOrdersCount: record.cancelledOrdersCount,
    pendingOrdersCount: record.pendingOrdersCount,
    deliveredOrdersCount: record.deliveredOrdersCount,
    directSalesCount: record.directSalesCount,
    grossSales: record.grossSales,
    incomeAmount: record.incomeAmount,
    costAmount: record.costAmount,
    profitAmount: record.profitAmount,
    outstandingAmount: record.outstandingAmount,
    snapshot: record.snapshotJson,
    closedAt: new Date(record.closedAt),
    closedByEmail: record.closedByEmail ?? null,
    closedByNombre: record.closedByNombre ?? null,
    reopenedAt: record.reopenedAt ? new Date(record.reopenedAt) : null,
    reopenedByEmail: record.reopenedByEmail ?? null,
    reopenedByNombre: record.reopenedByNombre ?? null,
    reopenReason: record.reopenReason ?? null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt)
  });
}

function sortByPeriodAndVersionDesc(items: LocalWeeklyClosureRecord[]) {
  return [...items].sort((a, b) => {
    const periodDiff = new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime();
    if (periodDiff !== 0) return periodDiff;
    return b.version - a.version;
  });
}

class MemoryCierreSemanalRepository implements CierreSemanalRepository {
  async listarCierres({ limit, offset }: ListarCierresSemanalesParams) {
    const sorted = sortByPeriodAndVersionDesc(localStore.weeklyClosures);
    const page = sorted.slice(offset, offset + limit);
    return { items: page.map(localRecordToCierreSemanal), total: sorted.length };
  }

  async obtenerCierrePorId(id: string) {
    const record = localStore.weeklyClosures.find((item) => item.id === id);
    return record ? localRecordToCierreSemanal(record) : null;
  }

  async obtenerCierreActivoPorPeriodo(periodStart: Date, periodEndExclusive: Date) {
    const record = localStore.weeklyClosures.find(
      (item) =>
        item.status === "CLOSED" &&
        item.periodStart === periodStart.toISOString() &&
        item.periodEndExclusive === periodEndExclusive.toISOString()
    );
    return record ? localRecordToCierreSemanal(record) : null;
  }

  async crearCierre(input: CrearCierreSemanalInput) {
    if (input.periodStart.getTime() >= input.periodEndExclusive.getTime()) {
      throw new Error("El periodo del cierre no es valido.");
    }

    const periodStartIso = input.periodStart.toISOString();
    const periodEndIso = input.periodEndExclusive.toISOString();

    const existingActive = localStore.weeklyClosures.some(
      (item) =>
        item.status === "CLOSED" && item.periodStart === periodStartIso && item.periodEndExclusive === periodEndIso
    );

    if (existingActive) {
      throw mapWeeklyClosureRpcError({ code: "WC001", message: "Ya existe un cierre activo para este periodo." });
    }

    const sameperiodVersions = localStore.weeklyClosures.filter(
      (item) => item.periodStart === periodStartIso && item.periodEndExclusive === periodEndIso
    );
    const nextVersion = sameperiodVersions.reduce((max, item) => Math.max(max, item.version), 0) + 1;

    const nowIso = new Date().toISOString();
    const record: LocalWeeklyClosureRecord = {
      id: crypto.randomUUID(),
      periodStart: periodStartIso,
      periodEndExclusive: periodEndIso,
      version: nextVersion,
      status: "CLOSED",
      ...metricsToRecordFields(input.metrics),
      snapshotJson: { ...metricsToRecordFields(input.metrics), ...input.snapshot },
      closedAt: nowIso,
      closedByEmail: input.admin.email ?? null,
      closedByNombre: input.admin.nombre ?? null,
      reopenedAt: null,
      reopenedByEmail: null,
      reopenedByNombre: null,
      reopenReason: null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    localStore.weeklyClosures.push(record);
    return localRecordToCierreSemanal(record);
  }

  async reabrirCierre(input: ReabrirCierreSemanalInput) {
    const record = localStore.weeklyClosures.find((item) => item.id === input.closureId);

    if (!record) {
      throw mapWeeklyClosureRpcError({ code: "WC002", message: "Cierre no encontrado." });
    }

    if (record.status === "REOPENED") {
      throw mapWeeklyClosureRpcError({ code: "WC003", message: "Este cierre ya fue reabierto." });
    }

    record.status = "REOPENED" as EstadoCierreSemanal;
    record.reopenedAt = new Date().toISOString();
    record.reopenedByEmail = input.admin.email ?? null;
    record.reopenedByNombre = input.admin.nombre ?? null;
    record.reopenReason = input.reason;
    record.updatedAt = record.reopenedAt;

    return localRecordToCierreSemanal(record);
  }
}

type SupabaseCierreSemanalRow = {
  id: string;
  period_start: string;
  period_end_exclusive: string;
  version: number;
  status: EstadoCierreSemanal;
  orders_count: number;
  cancelled_orders_count: number;
  pending_orders_count: number;
  delivered_orders_count: number;
  direct_sales_count: number;
  gross_sales: number;
  income_amount: number;
  cost_amount: number;
  profit_amount: number;
  outstanding_amount: number;
  snapshot_json: Record<string, unknown>;
  closed_at: string;
  closed_by_email: string | null;
  closed_by_nombre: string | null;
  reopened_at: string | null;
  reopened_by_email: string | null;
  reopened_by_nombre: string | null;
  reopen_reason: string | null;
  created_at: string;
  updated_at: string;
};

const CIERRE_SEMANAL_COLUMNS =
  "id, period_start, period_end_exclusive, version, status, orders_count, cancelled_orders_count, pending_orders_count, delivered_orders_count, direct_sales_count, gross_sales, income_amount, cost_amount, profit_amount, outstanding_amount, snapshot_json, closed_at, closed_by_email, closed_by_nombre, reopened_at, reopened_by_email, reopened_by_nombre, reopen_reason, created_at, updated_at";

function rowToCierreSemanal(row: SupabaseCierreSemanalRow): CierreSemanal {
  return new CierreSemanal({
    id: row.id,
    periodStart: new Date(row.period_start),
    periodEndExclusive: new Date(row.period_end_exclusive),
    version: row.version,
    status: row.status,
    ordersCount: row.orders_count,
    cancelledOrdersCount: row.cancelled_orders_count,
    pendingOrdersCount: row.pending_orders_count,
    deliveredOrdersCount: row.delivered_orders_count,
    directSalesCount: row.direct_sales_count,
    grossSales: Number(row.gross_sales),
    incomeAmount: Number(row.income_amount),
    costAmount: Number(row.cost_amount),
    profitAmount: Number(row.profit_amount),
    outstandingAmount: Number(row.outstanding_amount),
    snapshot: row.snapshot_json ?? {},
    closedAt: new Date(row.closed_at),
    closedByEmail: row.closed_by_email,
    closedByNombre: row.closed_by_nombre,
    reopenedAt: row.reopened_at ? new Date(row.reopened_at) : null,
    reopenedByEmail: row.reopened_by_email,
    reopenedByNombre: row.reopened_by_nombre,
    reopenReason: row.reopen_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  });
}

class SupabaseCierreSemanalRepository implements CierreSemanalRepository {
  async listarCierres({ limit, offset }: ListarCierresSemanalesParams) {
    const supabase = createSupabaseServerClient();
    const { data, error, count } = await supabase
      .from("cierres_semanales")
      .select(CIERRE_SEMANAL_COLUMNS, { count: "exact" })
      .order("period_start", { ascending: false })
      .order("version", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error("No fue posible consultar el historial de cierres semanales.");
    }

    const items = ((data ?? []) as SupabaseCierreSemanalRow[]).map(rowToCierreSemanal);
    return { items, total: count ?? items.length };
  }

  async obtenerCierrePorId(id: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("cierres_semanales")
      .select(CIERRE_SEMANAL_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error("No fue posible consultar el cierre semanal.");
    }

    return data ? rowToCierreSemanal(data as SupabaseCierreSemanalRow) : null;
  }

  async obtenerCierreActivoPorPeriodo(periodStart: Date, periodEndExclusive: Date) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("cierres_semanales")
      .select(CIERRE_SEMANAL_COLUMNS)
      .eq("period_start", periodStart.toISOString())
      .eq("period_end_exclusive", periodEndExclusive.toISOString())
      .eq("status", "CLOSED")
      .maybeSingle();

    if (error) {
      throw new Error("No fue posible consultar el cierre activo del periodo.");
    }

    return data ? rowToCierreSemanal(data as SupabaseCierreSemanalRow) : null;
  }

  async crearCierre(input: CrearCierreSemanalInput) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_weekly_closure_v1", {
      p_period_start: input.periodStart.toISOString(),
      p_period_end_exclusive: input.periodEndExclusive.toISOString(),
      p_metrics: { ...metricsToRecordFields(input.metrics), ...input.snapshot },
      p_admin_email: input.admin.email ?? null,
      p_admin_nombre: input.admin.nombre ?? null
    });

    if (error) {
      throw mapWeeklyClosureRpcError(error);
    }

    return rowToCierreSemanal(data as SupabaseCierreSemanalRow);
  }

  async reabrirCierre(input: ReabrirCierreSemanalInput) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("reopen_weekly_closure_v1", {
      p_closure_id: input.closureId,
      p_reason: input.reason,
      p_admin_email: input.admin.email ?? null,
      p_admin_nombre: input.admin.nombre ?? null
    });

    if (error) {
      throw mapWeeklyClosureRpcError(error);
    }

    return rowToCierreSemanal(data as SupabaseCierreSemanalRow);
  }
}

export function getCierreSemanalRepository(): CierreSemanalRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseCierreSemanalRepository();
  }

  return new MemoryCierreSemanalRepository();
}
