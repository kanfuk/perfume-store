import { beforeEach, describe, expect, it, vi } from "vitest";

const { isAdminAuthenticated, getAuthenticatedAdmin } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true),
  getAuthenticatedAdmin: vi.fn(async () => ({
    userId: "admin-uuid-1",
    email: "admin@smellme.cl",
    nombre: "Admin",
    rol: "admin"
  }))
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated, getAuthenticatedAdmin }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAction: vi.fn(), requestAuditId: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));

const {
  listarCierres,
  crearCierre,
  previsualizarCierre,
  obtenerDetalle,
  reabrirCierre,
  exportarCsv
} = vi.hoisted(() => ({
  listarCierres: vi.fn(async () => ({ items: [], total: 0, limit: 20, offset: 0 })),
  crearCierre: vi.fn(async () => ({ id: "cierre-1", status: "CLOSED" })),
  previsualizarCierre: vi.fn(async () => ({ periodStart: "x", periodEndExclusive: "y", metrics: {} })),
  obtenerDetalle: vi.fn(async () => ({ id: "cierre-1", status: "CLOSED" })),
  reabrirCierre: vi.fn(async () => ({ id: "cierre-1", status: "REOPENED" })),
  exportarCsv: vi.fn(async () => ({ filename: "smellme-cierre-semanal-2026-08-03-v1.csv", content: "campo,valor" }))
}));

vi.mock("@/services/cierreSemanalService", () => ({
  createCierreSemanalService: () => ({
    listarCierres,
    crearCierre,
    previsualizarCierre,
    obtenerDetalle,
    reabrirCierre,
    exportarCsv
  })
}));

import { WeeklyClosureError } from "@/lib/weeklyClosureErrors";
import { GET as listGET, POST as createPOST } from "@/app/api/admin/weekly-closures/route";
import { POST as previewPOST } from "@/app/api/admin/weekly-closures/preview/route";
import { GET as detailGET, PATCH as reopenPATCH } from "@/app/api/admin/weekly-closures/[closureId]/route";
import { GET as exportGET } from "@/app/api/admin/weekly-closures/[closureId]/export/route";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function context(closureId = "cierre-1") {
  return { params: Promise.resolve({ closureId }) };
}

beforeEach(() => {
  isAdminAuthenticated.mockClear();
  isAdminAuthenticated.mockResolvedValue(true);
  getAuthenticatedAdmin.mockClear();
  listarCierres.mockClear();
  crearCierre.mockClear();
  previsualizarCierre.mockClear();
  obtenerDetalle.mockClear();
  reabrirCierre.mockClear();
  exportarCsv.mockClear();
});

describe("GET /api/admin/weekly-closures", () => {
  it("rechaza sin sesion (401)", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await listGET(jsonRequest("http://localhost/api/admin/weekly-closures", "GET"));
    expect(response.status).toBe(401);
    expect(listarCierres).not.toHaveBeenCalled();
  });

  it("pasa limit/offset del query string al servicio", async () => {
    const response = await listGET(
      jsonRequest("http://localhost/api/admin/weekly-closures?limit=10&offset=5", "GET")
    );
    expect(response.status).toBe(200);
    expect(listarCierres).toHaveBeenCalledWith({ limit: 10, offset: 5 });
  });
});

describe("POST /api/admin/weekly-closures", () => {
  it("rechaza sin mondayDateInput (400)", async () => {
    const response = await createPOST(jsonRequest("http://localhost/api/admin/weekly-closures", "POST", {}));
    expect(response.status).toBe(400);
    expect(crearCierre).not.toHaveBeenCalled();
  });

  it("crea el cierre con la identidad del admin autenticado", async () => {
    const response = await createPOST(
      jsonRequest("http://localhost/api/admin/weekly-closures", "POST", { mondayDateInput: "2026-08-03" })
    );
    expect(response.status).toBe(201);
    expect(crearCierre).toHaveBeenCalledWith("2026-08-03", { email: "admin@smellme.cl", nombre: "Admin" });
  });

  it("traduce WeeklyClosureError WC001 a HTTP 409 con el codigo expuesto", async () => {
    crearCierre.mockRejectedValueOnce(new WeeklyClosureError("WC001", "Ya existe un cierre activo para este periodo."));
    const response = await createPOST(
      jsonRequest("http://localhost/api/admin/weekly-closures", "POST", { mondayDateInput: "2026-08-03" })
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("WC001");
  });
});

describe("POST /api/admin/weekly-closures/preview", () => {
  it("nunca llama a crearCierre (solo lectura)", async () => {
    const response = await previewPOST(
      jsonRequest("http://localhost/api/admin/weekly-closures/preview", "POST", { mondayDateInput: "2026-08-03" })
    );
    expect(response.status).toBe(200);
    expect(previsualizarCierre).toHaveBeenCalledWith("2026-08-03");
    expect(crearCierre).not.toHaveBeenCalled();
  });

  it("rechaza sin sesion (401)", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await previewPOST(
      jsonRequest("http://localhost/api/admin/weekly-closures/preview", "POST", { mondayDateInput: "2026-08-03" })
    );
    expect(response.status).toBe(401);
  });
});

describe("GET /api/admin/weekly-closures/[closureId]", () => {
  it("retorna el detalle", async () => {
    const response = await detailGET(jsonRequest("http://localhost/api/admin/weekly-closures/cierre-1", "GET"), context());
    expect(response.status).toBe(200);
    expect(obtenerDetalle).toHaveBeenCalledWith("cierre-1");
  });

  it("traduce WC002 (no encontrado) a HTTP 404", async () => {
    obtenerDetalle.mockRejectedValueOnce(new WeeklyClosureError("WC002", "Cierre no encontrado."));
    const response = await detailGET(jsonRequest("http://localhost/api/admin/weekly-closures/no-existe", "GET"), context("no-existe"));
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/admin/weekly-closures/[closureId] - reabrir", () => {
  it("rechaza una accion distinta de 'reopen'", async () => {
    const response = await reopenPATCH(
      jsonRequest("http://localhost/api/admin/weekly-closures/cierre-1", "PATCH", { action: "otra" }),
      context()
    );
    expect(response.status).toBe(400);
    expect(reabrirCierre).not.toHaveBeenCalled();
  });

  it("reabre con el motivo y la identidad del admin autenticado", async () => {
    const response = await reopenPATCH(
      jsonRequest("http://localhost/api/admin/weekly-closures/cierre-1", "PATCH", {
        action: "reopen",
        reason: "Motivo administrativo valido"
      }),
      context()
    );
    expect(response.status).toBe(200);
    expect(reabrirCierre).toHaveBeenCalledWith("cierre-1", "Motivo administrativo valido", {
      email: "admin@smellme.cl",
      nombre: "Admin"
    });
  });

  it("traduce WC004 (motivo invalido) a HTTP 400 con el mensaje del servicio", async () => {
    reabrirCierre.mockRejectedValueOnce(
      new WeeklyClosureError("WC004", "El motivo de reapertura debe tener entre 5 y 500 caracteres.")
    );
    const response = await reopenPATCH(
      jsonRequest("http://localhost/api/admin/weekly-closures/cierre-1", "PATCH", { action: "reopen", reason: "ab" }),
      context()
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/entre 5 y 500/);
  });

  it("rechaza sin sesion (401), sin llamar al servicio", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await reopenPATCH(
      jsonRequest("http://localhost/api/admin/weekly-closures/cierre-1", "PATCH", { action: "reopen", reason: "Motivo valido" }),
      context()
    );
    expect(response.status).toBe(401);
    expect(reabrirCierre).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/weekly-closures/[closureId]/export", () => {
  it("retorna un archivo CSV descargable con Content-Disposition attachment", async () => {
    const response = await exportGET(jsonRequest("http://localhost/api/admin/weekly-closures/cierre-1/export", "GET"), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(response.headers.get("Content-Disposition")).toContain("smellme-cierre-semanal-2026-08-03-v1.csv");
    const text = await response.text();
    expect(text).toBe("campo,valor");
  });

  it("rechaza sin sesion (401)", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await exportGET(jsonRequest("http://localhost/api/admin/weekly-closures/cierre-1/export", "GET"), context());
    expect(response.status).toBe(401);
    expect(exportarCsv).not.toHaveBeenCalled();
  });

  it("traduce WC002 (no encontrado) a HTTP 404", async () => {
    exportarCsv.mockRejectedValueOnce(new WeeklyClosureError("WC002", "Cierre no encontrado."));
    const response = await exportGET(jsonRequest("http://localhost/api/admin/weekly-closures/no-existe/export", "GET"), context("no-existe"));
    expect(response.status).toBe(404);
  });
});
