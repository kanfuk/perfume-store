/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Eliminacion segura de productos (V2.2.1)
 * Descripcion: Clasifica un producto en HARD_DELETE / ARCHIVE / BLOCKED
 * (mismo criterio que la RPC de reset masivo `reset_smellme_catalog_v1`,
 * supabase/migrations/20260805000000_smellme_mvp_v2_maintenance.sql, pero
 * para un solo producto) y ejecuta la mutacion correspondiente. La
 * clasificacion se hace en TypeScript porque depende del contrato de fecha
 * contable y limites de semana en America/Santiago ya resueltos en
 * lib/sales-accounting-date.ts / lib/weekly-closures/period.ts; la mutacion
 * se revalida de nuevo, en el instante exacto de la escritura, dentro de
 * las RPC transaccionales archive_product_v1 / hard_delete_product_v1 (ver
 * repositories/productRepository.ts), para no depender de que la
 * elegibilidad previa siga siendo valida (ventana de concurrencia).
 * Ver docs/SMELLME_SAFE_PRODUCT_REMOVAL_DESIGN.md.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { getSalesAccountingDate } from "@/lib/sales-accounting-date";
import { getCurrentWeekPeriod } from "@/lib/weekly-closures/period";
import type { ProductRemovalEligibility, ProductRemovalMode, ProductRemovalReason } from "@/lib/types";
import { getCierreSemanalRepository, type CierreSemanalRepository } from "@/repositories/cierreSemanalRepository";
import {
  getPedidoRepository,
  type PedidoRepository,
  type ProductoVentaRecord
} from "@/repositories/pedidoRepository";
import { getProductRepository, type ProductRepository } from "@/repositories/productRepository";

const ACTIVE_ORDER_STATES = new Set(["NUEVO", "AGENDADO", "PAGADO", "PREPARANDO", "DESPACHADO"]);

/**
 * Bloqueo de eliminacion/archivado: tanto el calculado por
 * `evaluarElegibilidad` como el detectado al revalidar en el instante
 * exacto de la escritura (carrera de concurrencia, seccion 11 del encargo).
 */
export class ProductRemovalBlockedError extends Error {
  readonly reason: ProductRemovalReason;

  constructor(reason: ProductRemovalReason) {
    super(reason);
    this.name = "ProductRemovalBlockedError";
    this.reason = reason;
  }
}

/** Traduce el mensaje crudo de la RPC/mock (ver repositories/productRepository.ts) a un bloqueo tipado. */
function wrapRepositoryRemovalError(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  if (message === "PRODUCT_HAS_ACTIVE_ORDERS") {
    return new ProductRemovalBlockedError("PRODUCT_HAS_ACTIVE_ORDERS");
  }
  if (message === "PRODUCT_HAS_HISTORY") {
    // El producto paso de ELIMINABLE a ARCHIVABLE entre la evaluacion fresca
    // y la escritura (una venta se registro en esos milisegundos). No es el
    // mismo bloqueo que PRODUCT_HAS_ACTIVE_ORDERS -- no hay pedido activo,
    // solo un nuevo historial -- asi que se devuelve un error generico y
    // reintentable en vez de rotular incorrectamente la razon del bloqueo.
    return new Error("El producto cambió de estado justo ahora. Vuelve a intentarlo.");
  }
  return error instanceof Error ? error : new Error("No fue posible eliminar el perfume. Intenta nuevamente.");
}

export type ProductRemovalResult = {
  mode: Extract<ProductRemovalMode, "HARD_DELETE" | "ARCHIVE">;
  imageStoragePath?: string;
};

export class ProductRemovalService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly pedidoRepository: PedidoRepository,
    private readonly cierreSemanalRepository: CierreSemanalRepository
  ) {}

  /**
   * No muta nada. Usada tanto por el endpoint de elegibilidad (para el
   * popup) como internamente, de nuevo, justo antes de mutar -- la UI
   * NUNCA autoriza por si sola el borrado (ver seccion 10 del encargo,
   * "evitar TOCTOU").
   */
  async evaluarElegibilidad(productId: string): Promise<ProductRemovalEligibility> {
    const product = await this.productRepository.buscarProductoPorId(productId);
    if (!product) {
      throw new Error("Producto no encontrado.");
    }

    const ventas = await this.pedidoRepository.buscarVentasPorProducto(productId);
    const activeVentas = ventas.filter((venta) => ACTIVE_ORDER_STATES.has(venta.estadoPedido));
    const entregadas = ventas.filter((venta) => venta.estadoPedido === "ENTREGADO");
    const stockReservado = product.stockReservado ?? 0;

    if (activeVentas.length > 0 || stockReservado > 0) {
      return {
        mode: "BLOCKED",
        reason: "PRODUCT_HAS_ACTIVE_ORDERS",
        activeOrders: Math.max(activeVentas.length, stockReservado > 0 ? 1 : 0),
        openWeekSales: 0,
        historicalSales: entregadas.length
      };
    }

    const openWeekSales = await this.contarVentasEnSemanaAbierta(entregadas);

    if (openWeekSales > 0) {
      return {
        mode: "BLOCKED",
        reason: "PRODUCT_HAS_OPEN_WEEK_SALES",
        activeOrders: 0,
        openWeekSales,
        historicalSales: entregadas.length
      };
    }

    if (ventas.length > 0) {
      return {
        mode: "ARCHIVE",
        reason: "HISTORICAL_SALES_CLOSED",
        activeOrders: 0,
        openWeekSales: 0,
        historicalSales: entregadas.length
      };
    }

    return {
      mode: "HARD_DELETE",
      reason: "NO_COMMERCIAL_HISTORY",
      activeOrders: 0,
      openWeekSales: 0,
      historicalSales: 0
    };
  }

  /**
   * Un producto con mucho historial puede tener decenas de ventas ENTREGADO
   * cayendo en un puñado de semanas distintas. Se deduplica por periodo
   * antes de consultar `cierres_semanales` (una consulta por semana unica,
   * en paralelo) en vez de una consulta secuencial por cada venta.
   */
  private async contarVentasEnSemanaAbierta(entregadas: ProductoVentaRecord[]): Promise<number> {
    const periodsByKey = new Map<string, ReturnType<typeof getCurrentWeekPeriod>>();
    const periodKeyByVenta = entregadas.map((venta) => {
      const period = getCurrentWeekPeriod(new Date(getSalesAccountingDate(venta)));
      periodsByKey.set(period.mondayDateInput, period);
      return period.mondayDateInput;
    });

    const openKeys = new Set<string>();
    await Promise.all(
      Array.from(periodsByKey.entries()).map(async ([key, period]) => {
        const closure = await this.cierreSemanalRepository.obtenerCierreActivoPorPeriodo(
          period.periodStart,
          period.periodEndExclusive
        );
        if (!closure) openKeys.add(key);
      })
    );

    return periodKeyByVenta.filter((key) => openKeys.has(key)).length;
  }

  /**
   * Recalcula elegibilidad (fresca, nunca confia en un resultado previo del
   * cliente) y, si no esta bloqueada, ejecuta la RPC correspondiente, que
   * vuelve a revalidar dentro de la misma transaccion con bloqueo de fila.
   * Lanza ProductRemovalBlockedError si el estado cambio entre la vista
   * previa y esta llamada (venta nueva, pedido nuevo, etc.).
   */
  async retirarProductoAdmin(productId: string, reason?: string): Promise<ProductRemovalResult> {
    const eligibility = await this.evaluarElegibilidad(productId);

    if (eligibility.mode === "BLOCKED") {
      throw new ProductRemovalBlockedError(eligibility.reason);
    }

    if (eligibility.mode === "HARD_DELETE") {
      try {
        const result = await this.productRepository.eliminarProductoSeguro(productId);
        return { mode: "HARD_DELETE", imageStoragePath: result.imageStoragePath };
      } catch (error) {
        throw wrapRepositoryRemovalError(error);
      }
    }

    try {
      await this.productRepository.archivarProductoSeguro(productId, reason);
      return { mode: "ARCHIVE" };
    } catch (error) {
      throw wrapRepositoryRemovalError(error);
    }
  }
}

export function createProductRemovalService(): ProductRemovalService {
  return new ProductRemovalService(getProductRepository(), getPedidoRepository(), getCierreSemanalRepository());
}
