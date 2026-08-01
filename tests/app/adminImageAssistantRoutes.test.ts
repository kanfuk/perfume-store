import { beforeEach, describe, expect, it, vi } from "vitest";

const { isAdminAuthenticated, analyze, search, processImage, preview, dryRun } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(), analyze: vi.fn(), search: vi.fn(), processImage: vi.fn(), preview: vi.fn(), dryRun: vi.fn()
}));
vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));
vi.mock("@/lib/http-security", () => ({ validateTrustedOrigin: () => null, validateJsonRequest: () => null }));
vi.mock("@/lib/image-assistant/source-provider", () => ({
  getImageAssistantHealth: () => ({ providerConfigured: false, signingSecretConfigured: false, allowedDomainsConfigured: false, searchEnabled: false, batchEnabled: false })
}));
vi.mock("@/services/imageAssistantService", () => ({
  computeCsvFingerprint: () => "abc123",
  createImageAssistantService: () => ({ analyze, search, process: processImage, preview, dryRun })
}));

import { POST as analyzeRoute } from "@/app/api/admin/image-assistant/analyze/route";
import { POST as candidateRoute } from "@/app/api/admin/image-assistant/[productId]/candidates/route";
import { POST as processRoute } from "@/app/api/admin/image-assistant/[productId]/process/route";
import { GET as healthRoute } from "@/app/api/admin/image-assistant/health/route";

const csv = Buffer.from("Perfume;Marca;Contenido;Precio Compra\nA;B;100ML;1000").toString("base64");
function request(body: unknown) { return new Request("http://localhost/api/admin/image-assistant/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
const context = { params: Promise.resolve({ productId: "p1" }) };

describe("admin safe image assistant routes", () => {
  beforeEach(() => { vi.clearAllMocks(); isAdminAuthenticated.mockResolvedValue(true); analyze.mockResolvedValue({ items: [], summary: {} }); search.mockResolvedValue({ productId: "p1", status: "SIN_FUENTE_SEGURA" }); processImage.mockResolvedValue({ image: {}, source: {} }); });
  it("rechaza análisis sin sesión", async () => { isAdminAuthenticated.mockResolvedValue(false); const response = await analyzeRoute(request({ fileName: "x.csv", fileBase64: csv })); expect(response.status).toBe(401); expect(analyze).not.toHaveBeenCalled(); });
  it("analiza el CSV sin ejecutar búsqueda ni escritura", async () => { const response = await analyzeRoute(request({ fileName: "x.csv", fileBase64: csv })); expect(response.status).toBe(200); expect(analyze).toHaveBeenCalledOnce(); expect(search).not.toHaveBeenCalled(); expect(processImage).not.toHaveBeenCalled(); });
  it("rechaza campos desconocidos", async () => { const response = await analyzeRoute(request({ fileName: "x.csv", fileBase64: csv, unsafe: true })); expect(response.status).toBe(400); });
  it("health sólo expone cinco booleanos", async () => {
    const response = await healthRoute();
    expect(await response.json()).toEqual({ providerConfigured: false, signingSecretConfigured: false, allowedDomainsConfigured: false, searchEnabled: false, batchEnabled: false });
  });
  it("busca por producto en una solicitud incremental", async () => { const response = await candidateRoute(request({ fileName: "x.csv", fileBase64: csv }), context); expect(response.status).toBe(200); expect(search).toHaveBeenCalledWith("p1", expect.any(Buffer)); });
  it("procesa solo un producto y exige candidato", async () => { const missing = await processRoute(request({ fileName: "x.csv", fileBase64: csv }), context); expect(missing.status).toBe(400); const response = await processRoute(request({ fileName: "x.csv", fileBase64: csv, candidate: { token: "signed" } }), context); expect(response.status).toBe(201); expect(processImage).toHaveBeenCalledOnce(); });
});
