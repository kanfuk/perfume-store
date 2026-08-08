import type { ProductoProps } from "@/domain/Producto";
import type {
  LocalOrderItemRecord,
  LocalOrderRecord
} from "@/lib/local-store";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";

export const TOP_RANKING_MODES = ["MANUAL", "AUTOMATIC", "HYBRID"] as const;
export type TopRankingMode = (typeof TOP_RANKING_MODES)[number];

export const DEFAULT_TOP_RANKING_MODE: TopRankingMode = "MANUAL";
export const DEFAULT_TOP_SALES_WINDOW_DAYS = 90;
export const MIN_TOP_SALES_WINDOW_DAYS = 1;
export const MAX_TOP_SALES_WINDOW_DAYS = 3650;

export type TopRankingConfiguration = {
  mode: TopRankingMode;
  /** null = todo el historial de ventas pagadas. */
  salesWindowDays: number | null;
};

export type EffectiveTopRankingEntry = {
  rank: number;
  productId: string;
  source: "MANUAL" | "AUTOMATIC";
  unitsSold: number;
  revenue: number;
};

export function validateTopRankingConfiguration(input: {
  mode?: unknown;
  salesWindowDays?: unknown;
}): TopRankingConfiguration {
  if (typeof input.mode !== "string" || !TOP_RANKING_MODES.includes(input.mode as TopRankingMode)) {
    throw new Error("El modo del Top 15 debe ser MANUAL, AUTOMATIC o HYBRID.");
  }

  if (input.salesWindowDays === null || input.salesWindowDays === "HISTORICAL") {
    return { mode: input.mode as TopRankingMode, salesWindowDays: null };
  }

  const salesWindowDays = typeof input.salesWindowDays === "number"
    ? input.salesWindowDays
    : Number(input.salesWindowDays);

  if (
    !Number.isInteger(salesWindowDays) ||
    salesWindowDays < MIN_TOP_SALES_WINDOW_DAYS ||
    salesWindowDays > MAX_TOP_SALES_WINDOW_DAYS
  ) {
    throw new Error(
      `La ventana de ventas debe ser un número entero entre ${MIN_TOP_SALES_WINDOW_DAYS} y ${MAX_TOP_SALES_WINDOW_DAYS} días.`
    );
  }

  return { mode: input.mode as TopRankingMode, salesWindowDays };
}

/**
 * Implementación equivalente a la función SQL de producción para el modo
 * local y para pruebas puras. Solo cuentan pedidos pagados, no cancelados y
 * dentro de la ventana configurada. Manual conserva las posiciones actuales;
 * híbrido rellena únicamente sus huecos.
 */
export function computeEffectiveTopRanking(input: {
  products: ProductoProps[];
  orders: LocalOrderRecord[];
  orderItems: LocalOrderItemRecord[];
  configuration: TopRankingConfiguration;
  now?: Date;
}): EffectiveTopRankingEntry[] {
  const { products, orders, orderItems, configuration } = input;
  const now = input.now ?? new Date();
  const since = configuration.salesWindowDays === null
    ? null
    : now.getTime() - configuration.salesWindowDays * 24 * 60 * 60 * 1000;
  const paidOrderIds = new Set(
    configuration.mode === "MANUAL"
      ? []
      : orders
          .filter((order) => {
            const date = Date.parse(order.fechaPago ?? order.fechaPedido);
            return (
              order.estadoPago === "PAGADO" &&
              order.estadoPedido !== "CANCELADO" &&
              Number.isFinite(date) &&
              (since === null || date >= since)
            );
          })
          .map((order) => order.id)
  );

  const sales = new Map<string, { unitsSold: number; revenue: number }>();
  for (const item of orderItems) {
    if (!item.productoId || !paidOrderIds.has(item.pedidoId)) continue;
    const current = sales.get(item.productoId) ?? { unitsSold: 0, revenue: 0 };
    current.unitsSold += item.cantidad;
    current.revenue += item.subtotal;
    sales.set(item.productoId, current);
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const manual = products
    .filter(
      (product) =>
        product.esTop &&
        Number.isInteger(product.ordenDestacado) &&
        (product.ordenDestacado as number) >= 1 &&
        (product.ordenDestacado as number) <= TOP_PRODUCTS_LIMIT
    )
    .sort((a, b) => (a.ordenDestacado as number) - (b.ordenDestacado as number) || a.id.localeCompare(b.id))
    .filter((product, index, all) => index === 0 || product.ordenDestacado !== all[index - 1].ordenDestacado)
    .map((product) => ({
      rank: product.ordenDestacado as number,
      productId: product.id,
      source: "MANUAL" as const,
      unitsSold: sales.get(product.id)?.unitsSold ?? 0,
      revenue: sales.get(product.id)?.revenue ?? 0
    }));

  if (configuration.mode === "MANUAL") return manual;

  const manualEntries = configuration.mode === "HYBRID" ? manual : [];
  const manualIds = new Set(manualEntries.map((entry) => entry.productId));
  const occupiedRanks = new Set(manualEntries.map((entry) => entry.rank));
  const openRanks = Array.from({ length: TOP_PRODUCTS_LIMIT }, (_, index) => index + 1).filter(
    (rank) => !occupiedRanks.has(rank)
  );

  const automatic = [...sales.entries()]
    .filter(([productId, summary]) => {
      const product = productById.get(productId);
      return (
        summary.unitsSold > 0 &&
        !!product &&
        !manualIds.has(productId) &&
        product.activo !== false &&
        (product.stockActual ?? product.stockAgenda ?? 0) > 0 &&
        product.precioVenta > 0 &&
        !!product.nombre.trim() &&
        !!product.marca?.trim() &&
        !!product.contenido?.trim()
      );
    })
    .sort(([idA, a], [idB, b]) => {
      const byUnits = b.unitsSold - a.unitsSold;
      if (byUnits !== 0) return byUnits;
      const byRevenue = b.revenue - a.revenue;
      if (byRevenue !== 0) return byRevenue;
      const byName = (productById.get(idA)?.nombre ?? "").localeCompare(
        productById.get(idB)?.nombre ?? "",
        "es"
      );
      return byName || idA.localeCompare(idB);
    })
    .slice(0, openRanks.length)
    .map(([productId, summary], index) => ({
      rank: openRanks[index],
      productId,
      source: "AUTOMATIC" as const,
      ...summary
    }));

  return [...manualEntries, ...automatic].sort((a, b) => a.rank - b.rank);
}
