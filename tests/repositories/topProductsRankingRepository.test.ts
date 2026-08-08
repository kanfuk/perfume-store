import { describe, expect, it } from "vitest";
import { isMissingTopRankingMigrationError } from "@/repositories/topProductsRankingRepository";

describe("compatibilidad de rollout del Top 15", () => {
  it("reconoce función y columnas ausentes como migración pendiente", () => {
    expect(isMissingTopRankingMigrationError({ code: "PGRST202" })).toBe(true);
    expect(isMissingTopRankingMigrationError({ code: "42703" })).toBe(true);
    expect(
      isMissingTopRankingMigrationError({
        message: "Could not find the function public.get_effective_top_products_v1(p_limit)"
      })
    ).toBe(true);
  });

  it("no oculta errores Supabase ajenos a la migración", () => {
    expect(isMissingTopRankingMigrationError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingTopRankingMigrationError(null)).toBe(false);
  });
});
