import { describe, expect, it } from "vitest";
import {
  httpStatusForWeeklyClosureError,
  mapWeeklyClosureRpcError,
  WeeklyClosureError
} from "@/lib/weeklyClosureErrors";

describe("mapWeeklyClosureRpcError", () => {
  it("mapea un codigo conocido a WeeklyClosureError preservando el mensaje", () => {
    const error = mapWeeklyClosureRpcError({ code: "WC001", message: "Ya existe un cierre activo para este periodo." });
    expect(error).toBeInstanceOf(WeeklyClosureError);
    expect((error as WeeklyClosureError).code).toBe("WC001");
    expect(error.message).toBe("Ya existe un cierre activo para este periodo.");
  });

  it("reconoce los 5 codigos documentados (WC001-WC005)", () => {
    for (const code of ["WC001", "WC002", "WC003", "WC004", "WC005"]) {
      const error = mapWeeklyClosureRpcError({ code, message: "mensaje" });
      expect(error).toBeInstanceOf(WeeklyClosureError);
    }
  });

  it("un codigo desconocido cae al mensaje generico (nunca expone detalle interno de Postgres)", () => {
    const error = mapWeeklyClosureRpcError({ code: "23505", message: "duplicate key value violates unique constraint" });
    expect(error).not.toBeInstanceOf(WeeklyClosureError);
    expect(error.message).toBe("No fue posible procesar el cierre semanal. Intenta nuevamente.");
  });

  it("un error nulo/indefinido tambien cae al mensaje generico", () => {
    expect(mapWeeklyClosureRpcError(null).message).toMatch(/no fue posible procesar/i);
    expect(mapWeeklyClosureRpcError(undefined).message).toMatch(/no fue posible procesar/i);
  });
});

describe("httpStatusForWeeklyClosureError", () => {
  it("WC001 (duplicado) mapea a 409", () => {
    expect(httpStatusForWeeklyClosureError(new WeeklyClosureError("WC001", "x"))).toBe(409);
  });

  it("WC002 (no encontrado) mapea a 404", () => {
    expect(httpStatusForWeeklyClosureError(new WeeklyClosureError("WC002", "x"))).toBe(404);
  });

  it("WC003 (ya reabierto) mapea a 409", () => {
    expect(httpStatusForWeeklyClosureError(new WeeklyClosureError("WC003", "x"))).toBe(409);
  });

  it("WC004/WC005 y cualquier otro codigo mapean a 400 por defecto", () => {
    expect(httpStatusForWeeklyClosureError(new WeeklyClosureError("WC004", "x"))).toBe(400);
    expect(httpStatusForWeeklyClosureError(new WeeklyClosureError("WC005", "x"))).toBe(400);
  });

  it("un error que no es WeeklyClosureError mapea a 400", () => {
    expect(httpStatusForWeeklyClosureError(new Error("generico"))).toBe(400);
  });
});
