import { describe, expect, it } from "vitest";
import {
  PerfumeOrderError,
  httpStatusForPerfumeOrderError,
  mapPerfumeOrderRpcError
} from "@/lib/perfumeOrderErrors";

describe("mapPerfumeOrderRpcError", () => {
  it("confia en el mensaje de Postgres cuando el codigo es un PFxxx conocido", () => {
    const error = mapPerfumeOrderRpcError({
      code: "PF005",
      message: "Stock insuficiente para Perfume floral."
    });

    expect(error).toBeInstanceOf(PerfumeOrderError);
    expect((error as PerfumeOrderError).code).toBe("PF005");
    expect(error.message).toBe("Stock insuficiente para Perfume floral.");
  });

  it("nunca expone detalles internos de PostgreSQL para codigos desconocidos", () => {
    const error = mapPerfumeOrderRpcError({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "pedidos_pkey" on relation public.pedidos'
    });

    expect(error).not.toBeInstanceOf(PerfumeOrderError);
    expect(error.message).toBe("No fue posible procesar el pedido. Intenta nuevamente.");
    expect(error.message).not.toMatch(/constraint|relation|pkey|postgres/i);
  });

  it("devuelve un mensaje generico ante errores nulos, vacios o de conexion", () => {
    expect(mapPerfumeOrderRpcError(null).message).toBe(
      "No fue posible procesar el pedido. Intenta nuevamente."
    );
    expect(mapPerfumeOrderRpcError(undefined).message).toBe(
      "No fue posible procesar el pedido. Intenta nuevamente."
    );
    expect(
      mapPerfumeOrderRpcError({ message: "fetch failed" }).message
    ).toBe("No fue posible procesar el pedido. Intenta nuevamente.");
  });

  it("no confia en un mensaje inventado si el codigo PFxxx no viene acompanado de mensaje", () => {
    const error = mapPerfumeOrderRpcError({ code: "PF005" });

    expect(error).not.toBeInstanceOf(PerfumeOrderError);
    expect(error.message).toBe("No fue posible procesar el pedido. Intenta nuevamente.");
  });
});

describe("httpStatusForPerfumeOrderError", () => {
  it("mapea codigos conocidos al status HTTP correcto", () => {
    expect(httpStatusForPerfumeOrderError(new PerfumeOrderError("PF009", "x"))).toBe(404);
    expect(httpStatusForPerfumeOrderError(new PerfumeOrderError("PF005", "x"))).toBe(409);
    expect(httpStatusForPerfumeOrderError(new PerfumeOrderError("PF010", "x"))).toBe(409);
    expect(httpStatusForPerfumeOrderError(new PerfumeOrderError("PF011", "x"))).toBe(409);
    expect(httpStatusForPerfumeOrderError(new PerfumeOrderError("PF013", "x"))).toBe(409);
    expect(httpStatusForPerfumeOrderError(new PerfumeOrderError("PF006", "x"))).toBe(400);
  });

  it("usa 400 por defecto para errores que no son PerfumeOrderError", () => {
    expect(httpStatusForPerfumeOrderError(new Error("generico"))).toBe(400);
    expect(httpStatusForPerfumeOrderError("no es un error")).toBe(400);
  });
});
