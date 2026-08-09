import { describe, expect, it } from "vitest";
import {
  filterOrdersByAccountingRange,
  getSalesAccountingDate,
  getSalesAccountingDateKey
} from "@/lib/sales-accounting-date";

describe("getSalesAccountingDate", () => {
  it("prioriza pago, luego confirmación/finalización y finalmente pedido", () => {
    expect(
      getSalesAccountingDate({
        fechaPedido: "2026-08-01T10:00:00.000Z",
        fechaFinalizacion: "2026-08-02T10:00:00.000Z",
        fechaConfirmacion: "2026-08-03T10:00:00.000Z",
        fechaPago: "2026-08-04T10:00:00.000Z"
      })
    ).toBe("2026-08-04T10:00:00.000Z");
  });

  it("convierte la fecha contable a America/Santiago", () => {
    expect(getSalesAccountingDateKey({ fechaPedido: "2026-08-08T02:30:00.000Z" })).toBe("2026-08-07");
  });

  it("pedido pagado hoy con entrega futura aparece en hoy, semana y mes", () => {
    const order = {
      id: "paid-today",
      fechaPedido: "2026-08-01T12:00:00.000Z",
      fechaPago: "2026-08-08T15:00:00.000Z",
      fechaEntrega: "2026-08-15T15:00:00.000Z"
    };

    expect(filterOrdersByAccountingRange([order], "2026-08-08", "2026-08-08")).toHaveLength(1);
    expect(filterOrdersByAccountingRange([order], "2026-08-03", "2026-08-09")).toHaveLength(1);
    expect(filterOrdersByAccountingRange([order], "2026-08-01", "2026-08-31")).toHaveLength(1);
  });
});
