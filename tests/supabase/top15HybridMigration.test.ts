import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260807010000_top15_hybrid_automatic_configurable.sql",
  "utf8"
);

describe("migración Top 15 híbrido", () => {
  it("parte en MANUAL para no cambiar la portada al desplegar", () => {
    expect(migration).toMatch(/top_ranking_mode text not null default 'MANUAL'/);
    expect(migration).toMatch(/top_sales_window_days integer default 90/);
  });

  it("restringe modos y ventana configurable", () => {
    expect(migration).toContain("top_ranking_mode in ('MANUAL', 'AUTOMATIC', 'HYBRID')");
    expect(migration).toContain("top_sales_window_days is null or top_sales_window_days between 1 and 3650");
  });

  it("el cálculo automático cuenta solo ventas pagadas, no canceladas y dentro de ventana", () => {
    expect(migration).toContain("pe.estado_pago = 'PAGADO'");
    expect(migration).toContain("pe.estado_pedido <> 'CANCELADO'");
    expect(migration).toMatch(/make_interval\(days => c\.window_days\)/);
    expect(migration).toContain("c.window_days is null");
    expect(migration).toMatch(/sum\(pi\.cantidad\)::bigint as units_sold/);
  });

  it("recibe el límite desde TOP_PRODUCTS_LIMIT a través de p_limit", () => {
    expect(migration).toContain("get_effective_top_products_v1(p_limit integer)");
    expect(migration).toContain("generate_series(1, p_limit)");
    expect(migration).not.toContain("generate_series(1, 15)");
  });

  it("la función no queda ejecutable desde clientes públicos", () => {
    expect(migration).toMatch(
      /revoke all on function public\.get_effective_top_products_v1\(integer\)[\s\S]*from public, anon, authenticated/
    );
    expect(migration).toMatch(
      /grant execute on function public\.get_effective_top_products_v1\(integer\)[\s\S]*to service_role/
    );
  });
});
