import { isSupabaseConfigured } from "@/lib/env";
import { getChileTodayInputValue } from "@/lib/date";
import {
  localStore,
  type LocalAdminOperationLog,
  type LocalArchivedRecord
} from "@/lib/local-store";
import type {
  AdminMaintenanceAction,
  AdminMaintenanceResult,
  AdminMaintenanceSummary
} from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MaintenanceAdmin = {
  email: string;
  nombre: string | null;
};

export class AdminMaintenanceService {
  async run(
    action: AdminMaintenanceAction,
    admin: MaintenanceAdmin
  ): Promise<AdminMaintenanceResult> {
    if (isSupabaseConfigured()) {
      return this.runSupabase(action, admin);
    }

    return this.runLocal(action, admin);
  }

  private async runSupabase(
    action: AdminMaintenanceAction,
    admin: MaintenanceAdmin
  ): Promise<AdminMaintenanceResult> {
    const supabase = createSupabaseServerClient();
    const functionName = "admin_cerrar_mes_operativo";
    const { data, error } = await supabase.rpc(functionName, {
      p_admin_email: admin.email,
      p_admin_nombre: admin.nombre
    });

    if (error) {
      if (
        error.code === "42883" ||
        error.message.includes(functionName) ||
        error.message.toLowerCase().includes("does not exist")
      ) {
        throw new Error(
          "La base aun no tiene la funcion SQL de mantenimiento. Ejecuta el schema actualizado de Supabase antes de usar este boton."
        );
      }

      throw new Error(error.message || "No fue posible ejecutar la operacion.");
    }

    return normalizeMaintenanceResult(data);
  }

  private async runLocal(
    action: AdminMaintenanceAction,
    admin: MaintenanceAdmin
  ): Promise<AdminMaintenanceResult> {
    return this.closeLocalMonth(admin);
  }

  private closeLocalMonth(admin: MaintenanceAdmin): AdminMaintenanceResult {
    const hasOpenWork = localStore.orders.some(
      (order) => order.estadoPedido !== "ENTREGADO" && order.estadoPedido !== "CANCELADO"
    );

    if (hasOpenWork) {
      throw new Error(
        "No se puede cerrar el mes mientras existan pedidos abiertos (no entregados ni cancelados)."
      );
    }

    const summary = buildLocalSummary();

    if (isSummaryEmpty(summary)) {
      throw new Error("No hay data operativa para cerrar.");
    }

    const operationId = crypto.randomUUID();
    const periodo = getCurrentPeriod();
    const createdAt = new Date().toISOString();

    archiveLocalRecords(operationId, createdAt);
    resetOperationalLocalData();

    const log: LocalAdminOperationLog = {
      id: operationId,
      tipo: "CIERRE_MENSUAL",
      periodo,
      ejecutadoPorEmail: admin.email,
      ejecutadoPorNombre: admin.nombre,
      resumen: summary,
      createdAt
    };
    localStore.adminOperationLogs.push(log);

    return {
      operationId,
      tipo: log.tipo,
      periodo,
      resumen: summary,
      message: "Cierre mensual completado. La operacion quedo archivada y el panel operativo quedo limpio."
    };
  }

}

function getCurrentPeriod() {
  return getChileTodayInputValue().slice(0, 7);
}

function buildLocalSummary(): AdminMaintenanceSummary {
  return {
    pedidos: localStore.orders.length,
    clientes: localStore.customers.length,
    items: localStore.orderItems.length,
    pagos: localStore.payments.length,
    fiados: localStore.fiados.length,
    totalVentas: localStore.orders.reduce((sum, order) => sum + order.total, 0)
  };
}

function isSummaryEmpty(summary: AdminMaintenanceSummary) {
  return (
    summary.pedidos === 0 &&
    summary.clientes === 0 &&
    summary.items === 0 &&
    summary.pagos === 0 &&
    summary.fiados === 0
  );
}

function archiveLocalRecords(operationId: string, createdAt: string) {
  localStore.archivedCustomers.push(
    ...localStore.customers.map((record) =>
      createArchiveRecord(operationId, record.id, record, createdAt)
    )
  );
  localStore.archivedOrders.push(
    ...localStore.orders.map((record) =>
      createArchiveRecord(operationId, record.id, record, createdAt)
    )
  );
  localStore.archivedOrderItems.push(
    ...localStore.orderItems.map((record) =>
      createArchiveRecord(operationId, record.id, record, createdAt)
    )
  );
  localStore.archivedPayments.push(
    ...localStore.payments.map((record) =>
      createArchiveRecord(operationId, record.id, record, createdAt)
    )
  );
  localStore.archivedFiados.push(
    ...localStore.fiados.map((record) =>
      createArchiveRecord(operationId, record.id, record, createdAt)
    )
  );
}

function createArchiveRecord<T>(
  operationId: string,
  originalId: string,
  payload: T,
  createdAt: string
): LocalArchivedRecord<T> {
  return {
    id: crypto.randomUUID(),
    operacionId: operationId,
    originalId,
    payload: structuredClone(payload),
    createdAt
  };
}

function resetOperationalLocalData() {
  localStore.fiados = [];
  localStore.payments = [];
  localStore.orderItems = [];
  localStore.orders = [];
  localStore.customers = [];
}

function normalizeMaintenanceResult(data: unknown): AdminMaintenanceResult {
  const current = (data ?? {}) as Partial<AdminMaintenanceResult> & {
    resumen?: Partial<AdminMaintenanceSummary>;
  };

  return {
    operationId: current.operationId ?? crypto.randomUUID(),
    tipo: current.tipo ?? "CIERRE_MENSUAL",
    periodo: current.periodo ?? getCurrentPeriod(),
    resumen: {
      pedidos: current.resumen?.pedidos ?? 0,
      clientes: current.resumen?.clientes ?? 0,
      items: current.resumen?.items ?? 0,
      pagos: current.resumen?.pagos ?? 0,
      fiados: current.resumen?.fiados ?? 0,
      totalVentas: current.resumen?.totalVentas ?? 0
    },
    message: current.message ?? "Cierre mensual completado."
  };
}

export function createAdminMaintenanceService() {
  return new AdminMaintenanceService();
}
