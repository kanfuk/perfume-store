import { describe, expect, it, vi, beforeEach } from "vitest";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));

const { previsualizarImportacionCsv, confirmarImportacionCsv } = vi.hoisted(() => ({
  previsualizarImportacionCsv: vi.fn(async () => ({
    totalFilas: 1,
    filasValidas: [{ sku: "SML-1" }] as unknown[],
    erroresFila: [] as unknown[],
    plan: [{ row: { sku: "SML-1" }, action: "CREAR", reasons: [] }] as unknown[],
    resumen: { crear: 1, actualizar: 0, bloqueado: 0 },
    erroresGlobales: [] as string[]
  })),
  confirmarImportacionCsv: vi.fn(async () => ({ creados: 1, actualizados: 0 }))
}));

vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({ previsualizarImportacionCsv, confirmarImportacionCsv })
}));

import { POST } from "@/app/api/admin/products/import/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/products/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST /api/admin/products/import", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    previsualizarImportacionCsv.mockClear();
    confirmarImportacionCsv.mockClear();
  });

  it("rechaza con 401 cuando el admin no esta autenticado", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);

    const response = await POST(makeRequest({ action: "preview", fileName: "a.csv", fileBase64: "AA==" }));

    expect(response.status).toBe(401);
    expect(previsualizarImportacionCsv).not.toHaveBeenCalled();
  });

  it("rechaza cuando falta el archivo", async () => {
    const response = await POST(makeRequest({ action: "preview" }));
    expect(response.status).toBe(400);
  });

  it("rechaza archivos cuyo base64 excede el limite de tamaño", async () => {
    const hugeBase64 = "A".repeat(3 * 1024 * 1024 + 10);
    const response = await POST(
      makeRequest({ action: "preview", fileName: "a.csv", fileBase64: hugeBase64 })
    );
    expect(response.status).toBe(413);
    expect(previsualizarImportacionCsv).not.toHaveBeenCalled();
  });

  it("action=preview solo llama al preview (dry-run), nunca a confirmar", async () => {
    const response = await POST(
      makeRequest({ action: "preview", fileName: "a.csv", fileBase64: "aGVsbG8=" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.preview.resumen).toEqual({ crear: 1, actualizar: 0, bloqueado: 0 });
    expect(previsualizarImportacionCsv).toHaveBeenCalledTimes(1);
    expect(confirmarImportacionCsv).not.toHaveBeenCalled();
  });

  it("action=confirm ejecuta la escritura solo si no hay errores globales", async () => {
    const response = await POST(
      makeRequest({ action: "confirm", fileName: "a.csv", fileBase64: "aGVsbG8=" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.creados).toBe(1);
    expect(confirmarImportacionCsv).toHaveBeenCalledTimes(1);
  });

  it("action=confirm se bloquea cuando el preview trae errores globales", async () => {
    previsualizarImportacionCsv.mockResolvedValueOnce({
      totalFilas: 1,
      filasValidas: [],
      erroresFila: [],
      plan: [],
      resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
      erroresGlobales: ["Hay más de 12 productos destacados."]
    });

    const response = await POST(
      makeRequest({ action: "confirm", fileName: "a.csv", fileBase64: "aGVsbG8=" })
    );

    expect(response.status).toBe(400);
    expect(confirmarImportacionCsv).not.toHaveBeenCalled();
  });
});
