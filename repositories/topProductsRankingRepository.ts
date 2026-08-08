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
        localStore.businessSettings.topSalesWindowDays ?? DEFAULT_TOP_SALES_WINDOW_DAYS
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

class SupabaseTopProductsRankingRepository implements TopProductsRankingRepository {
  async obtenerConfiguracion(): Promise<TopRankingConfiguration> {
    const { data, error } = await createSupabaseServerClient()
      .from("business_settings")
      .select("top_ranking_mode, top_sales_window_days")
      .eq("id", BUSINESS_SETTINGS_SINGLETON_ID)
      .single();

    if (error || !data) {
      throw new Error("No fue posible cargar la configuración del Top 15.");
    }

    return {
      mode: data.top_ranking_mode ?? DEFAULT_TOP_RANKING_MODE,
      salesWindowDays: data.top_sales_window_days ?? DEFAULT_TOP_SALES_WINDOW_DAYS
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
}

export function getTopProductsRankingRepository(): TopProductsRankingRepository {
  return isSupabaseConfigured()
    ? new SupabaseTopProductsRankingRepository()
    : new MemoryTopProductsRankingRepository();
}
