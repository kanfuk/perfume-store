import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TOP_PRODUCTS_LIMIT } from "@/lib/constants";
import {
  computeEffectiveTopRanking,
  DEFAULT_TOP_RANKING_MODE,
  DEFAULT_TOP_SALES_WINDOW_DAYS,
  type EffectiveTopRankingEntry,
  type TopRankingConfiguration
} from "@/lib/top-products-ranking";

const BUSINESS_SETTINGS_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

export interface TopProductsRankingRepository {
  obtenerConfiguracion(): Promise<TopRankingConfiguration>;
  guardarConfiguracion(configuration: TopRankingConfiguration): Promise<TopRankingConfiguration>;
  obtenerRankingEfectivo(): Promise<EffectiveTopRankingEntry[]>;
}

class MemoryTopProductsRankingRepository implements TopProductsRankingRepository {
  async obtenerConfiguracion(): Promise<TopRankingConfiguration> {
    return {
      mode: localStore.businessSettings.topRankingMode ?? DEFAULT_TOP_RANKING_MODE,
      salesWindowDays:
        localStore.businessSettings.topSalesWindowDays === undefined
          ? DEFAULT_TOP_SALES_WINDOW_DAYS
          : localStore.businessSettings.topSalesWindowDays
    };
  }

  async guardarConfiguracion(
    configuration: TopRankingConfiguration
  ): Promise<TopRankingConfiguration> {
    localStore.businessSettings.topRankingMode = configuration.mode;
    localStore.businessSettings.topSalesWindowDays = configuration.salesWindowDays;
    localStore.businessSettings.updatedAt = new Date().toISOString();
    return this.obtenerConfiguracion();
  }

  async obtenerRankingEfectivo(): Promise<EffectiveTopRankingEntry[]> {
    return computeEffectiveTopRanking({
      products: localStore.products,
      orders: localStore.orders,
      orderItems: localStore.orderItems,
      fiados: localStore.fiados,
      configuration: await this.obtenerConfiguracion()
    });
  }
}

type EffectiveTopRow = {
  rank: number;
  product_id: string;
  source: "MANUAL" | "AUTOMATIC";
  units_sold: number | string;
  revenue: number | string;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

/** Permite desplegar código antes que la migración sin romper el Top manual productivo. */
export function isMissingTopRankingMigrationError(error: SupabaseErrorLike | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42703" ||
    error.message?.includes("get_effective_top_products_v1") === true ||
    error.message?.includes("top_ranking_mode") === true ||
    error.message?.includes("top_sales_window_days") === true
  );
}

class SupabaseTopProductsRankingRepository implements TopProductsRankingRepository {
  async obtenerConfiguracion(): Promise<TopRankingConfiguration> {
    const { data, error } = await createSupabaseServerClient()
      .from("business_settings")
      .select("top_ranking_mode, top_sales_window_days")
      .eq("id", BUSINESS_SETTINGS_SINGLETON_ID)
      .single();

    if (isMissingTopRankingMigrationError(error)) {
      return {
        mode: DEFAULT_TOP_RANKING_MODE,
        salesWindowDays: DEFAULT_TOP_SALES_WINDOW_DAYS
      };
    }

    if (error || !data) {
      throw new Error("No fue posible cargar la configuración del Top 15.");
    }

    return {
      mode: data.top_ranking_mode ?? DEFAULT_TOP_RANKING_MODE,
      salesWindowDays:
        data.top_sales_window_days === undefined
          ? DEFAULT_TOP_SALES_WINDOW_DAYS
          : data.top_sales_window_days
    };
  }

  async guardarConfiguracion(
    configuration: TopRankingConfiguration
  ): Promise<TopRankingConfiguration> {
    const { error } = await createSupabaseServerClient()
      .from("business_settings")
      .update({
        top_ranking_mode: configuration.mode,
        top_sales_window_days: configuration.salesWindowDays
      })
      .eq("id", BUSINESS_SETTINGS_SINGLETON_ID);

    if (isMissingTopRankingMigrationError(error)) {
      throw new Error(
        "Aplica la migración del Top 15 antes de activar el modo automático o híbrido."
      );
    }

    if (error) {
      throw new Error("No fue posible guardar la configuración del Top 15.");
    }

    return this.obtenerConfiguracion();
  }

  async obtenerRankingEfectivo(): Promise<EffectiveTopRankingEntry[]> {
    const { data, error } = await createSupabaseServerClient().rpc(
      "get_effective_top_products_v1",
      { p_limit: TOP_PRODUCTS_LIMIT }
    );

    if (isMissingTopRankingMigrationError(error)) {
      return this.obtenerRankingManualLegado();
    }

    if (error) {
      throw new Error(`No fue posible calcular el Top 15. ${error.message}`);
    }

    return ((data ?? []) as EffectiveTopRow[]).map((row) => ({
      rank: Number(row.rank),
      productId: row.product_id,
      source: row.source,
      unitsSold: Number(row.units_sold),
      revenue: Number(row.revenue)
    }));
  }

  private async obtenerRankingManualLegado(): Promise<EffectiveTopRankingEntry[]> {
    const { data, error } = await createSupabaseServerClient()
      .from("productos")
      .select("id, orden_destacado")
      .eq("es_top", true)
      .not("orden_destacado", "is", null)
      .order("orden_destacado", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`No fue posible cargar el Top 15 manual. ${error.message}`);
    }

    const usedRanks = new Set<number>();
    const ranking: EffectiveTopRankingEntry[] = [];
    for (const product of data ?? []) {
      const rank = Number(product.orden_destacado);
      if (
        !Number.isInteger(rank) ||
        rank < 1 ||
        rank > TOP_PRODUCTS_LIMIT ||
        usedRanks.has(rank)
      ) {
        continue;
      }
      usedRanks.add(rank);
      ranking.push({
        rank,
        productId: product.id,
        source: "MANUAL",
        unitsSold: 0,
        revenue: 0
      });
    }
    return ranking;
  }
}

export function getTopProductsRankingRepository(): TopProductsRankingRepository {
  return isSupabaseConfigured()
    ? new SupabaseTopProductsRankingRepository()
    : new MemoryTopProductsRankingRepository();
}
