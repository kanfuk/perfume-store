import { describe, expect, it, vi, beforeEach } from "vitest";

const { isAdminAuthenticated } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true)
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));

const {
  previsualizarImportacionCsv,
  confirmarImportacionCsv,
  previsualizarImportacionProveedor,
  confirmarImportacionProveedor,
  revisarCalidadImportacionProveedor,
  obtenerProductosParaRevisionCalidad,
  construirPlanConDecisiones
} = vi.hoisted(() => ({
  previsualizarImportacionCsv: vi.fn(async () => ({
    totalFilas: 1,
    filasValidas: [{ sku: "SML-1" }] as unknown[],
    erroresFila: [] as unknown[],
    plan: [{ row: { sku: "SML-1" }, action: "CREAR", reasons: [] }] as unknown[],
    resumen: { crear: 1, actualizar: 0, bloqueado: 0 },
    erroresGlobales: [] as string[]
  })),
  confirmarImportacionCsv: vi.fn(async () => ({ creados: 1, actualizados: 0 })),
  previsualizarImportacionProveedor: vi.fn(async () => ({
    perfil: "proveedor",
    porcentajeAplicado: 35,
    filasFisicas: 1,
    filasVacias: 0,
    filasUtiles: 1,
    erroresFila: [] as unknown[],
    plan: [
      {
        rowNumber: 2,
        sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
        nombre: "La Bomba",
        marca: "Carolina Herrera",
        contenido: "80ML",
        costoUnitario: 58000,
        precioVenta: 78300,
        action: "CREAR"
      }
    ] as unknown[],
    resumen: { crear: 1, actualizar: 0, bloqueado: 0 },
    erroresGlobales: [] as string[]
  })),
  confirmarImportacionProveedor: vi.fn(async () => ({ creados: 1, actualizados: 0 })),
  revisarCalidadImportacionProveedor: vi.fn(async () => ({
    findings: [] as unknown[],
    summary: {
      filasFisicas: 1,
      filasVacias: 0,
      filasUtiles: 1,
      normalizacionesSeguras: 0,
      variantesDetectadas: 0,
      posiblesDuplicados: 0,
      coincidenciasCatalogoExistente: 0,
      incoherenciasNombreOMarca: 0,
      advertenciasCosto: 0,
      conflictosPendientes: 0
    },
    normalizedRows: [] as unknown[]
  })),
  obtenerProductosParaRevisionCalidad: vi.fn(async () => [] as unknown[]),
  construirPlanConDecisiones: vi.fn(async () => ({
    review: { findings: [], summary: {} },
    applied: {
      plan: [
        {
          rowNumbers: [2],
          sku: "SML-CAROLINA-HERRERA-LA-BOMBA-80ML",
          nombre: "La Bomba",
          marca: "Carolina Herrera",
          contenido: "80ML",
          costoUnitario: 58000,
          precioVentaSugerido: 78300,
          precioVentaFinal: 78300,
          modoPrecio: "AUTO",
          action: "CREAR"
        }
      ] as unknown[],
      unresolvedBlockers: [] as unknown[],
      errors: [] as string[]
    }
  }))
}));

vi.mock("@/services/productoService", () => ({
  createProductoService: () => ({
    previsualizarImportacionCsv,
    confirmarImportacionCsv,
    previsualizarImportacionProveedor,
    confirmarImportacionProveedor,
    revisarCalidadImportacionProveedor,
    obtenerProductosParaRevisionCalidad,
    construirPlanConDecisiones
  })
}));

import { POST } from "@/app/api/admin/products/import/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/products/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Contenido base64 irrelevante para el contenido real: al forzar "profile"
// explicitamente, la ruta nunca intenta detectar el perfil por encabezados.
const FAKE_FILE_BASE64 = "aGVsbG8=";

async function getPreviewHash(extra: Record<string, unknown> = {}): Promise<string> {
  const response = await POST(
    makeRequest({ action: "preview", fileName: "a.csv", fileBase64: FAKE_FILE_BASE64, ...extra })
  );
  const data = await response.json();
  return data.previewHash;
}

async function getReviewHash(previewHash: string, extra: Record<string, unknown> = {}): Promise<string> {
  const response = await POST(
    makeRequest({
      action: "quality-review",
      fileName: "a.csv",
      fileBase64: FAKE_FILE_BASE64,
      profile: "proveedor",
      previewHash,
      ...extra
    })
  );
  const data = await response.json();
  return data.reviewHash;
}

describe("POST /api/admin/products/import", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    previsualizarImportacionCsv.mockClear();
    confirmarImportacionCsv.mockClear();
    previsualizarImportacionProveedor.mockClear();
    confirmarImportacionProveedor.mockClear();
    revisarCalidadImportacionProveedor.mockClear();
    obtenerProductosParaRevisionCalidad.mockClear();
    construirPlanConDecisiones.mockClear();
  });

  it("rechaza con 401 cuando el admin no esta autenticado", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);

    const response = await POST(makeRequest({ action: "preview", fileName: "a.csv", fileBase64: "AA==" }));

    expect(response.status).toBe(401);
    expect(previsualizarImportacionCsv).not.toHaveBeenCalled();
  });

  it("rechaza con 401 la accion quality-review sin sesion admin", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);

    const response = await POST(
      makeRequest({ action: "quality-review", fileName: "a.csv", fileBase64: "AA==", profile: "proveedor" })
    );

    expect(response.status).toBe(401);
    expect(revisarCalidadImportacionProveedor).not.toHaveBeenCalled();
  });

  it("rechaza cuando falta el archivo", async () => {
    const response = await POST(makeRequest({ action: "preview" }));
    expect(response.status).toBe(400);
  });

  it("rechaza archivos cuyo base64 excede el limite de tamaño", async () => {
    const hugeBase64 = "A".repeat(3 * 1024 * 1024 + 10);
    const response = await POST(
      makeRequest({ action: "preview", fileName: "a.csv", fileBase64: hugeBase64, profile: "canonico" })
    );
    expect(response.status).toBe(413);
    expect(previsualizarImportacionCsv).not.toHaveBeenCalled();
  });

  it("rechaza cuando no se puede detectar el perfil automaticamente", async () => {
    // "hola mundo" no tiene encabezados de ningun perfil conocido.
    const buffer = Buffer.from("hola,mundo\n1,2", "utf8");
    const response = await POST(
      makeRequest({ action: "preview", fileName: "a.csv", fileBase64: buffer.toString("base64") })
    );
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toMatch(/perfil de importación/i);
  });

  describe("perfil canonico", () => {
    it("action=preview solo llama al preview (dry-run) y devuelve previewHash", async () => {
      const response = await POST(
        makeRequest({ action: "preview", fileName: "a.csv", fileBase64: FAKE_FILE_BASE64, profile: "canonico" })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.perfil).toBe("canonico");
      expect(typeof data.previewHash).toBe("string");
      expect(data.previewHash.length).toBeGreaterThan(0);
      expect(data.preview.resumen).toEqual({ crear: 1, actualizar: 0, bloqueado: 0 });
      expect(previsualizarImportacionCsv).toHaveBeenCalledTimes(1);
      expect(confirmarImportacionCsv).not.toHaveBeenCalled();
    });

    it("action=confirm ejecuta la escritura cuando el previewHash coincide", async () => {
      const previewHash = await getPreviewHash({ profile: "canonico" });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "canonico",
          previewHash
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.creados).toBe(1);
      expect(confirmarImportacionCsv).toHaveBeenCalledTimes(1);
    });

    it("action=confirm se rechaza con 409 si el previewHash no coincide (archivo/perfil cambiaron)", async () => {
      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "canonico",
          previewHash: "hash-invalido"
        })
      );

      expect(response.status).toBe(409);
      expect(confirmarImportacionCsv).not.toHaveBeenCalled();
    });

    it("action=confirm se bloquea cuando el preview trae errores globales, aun con hash valido", async () => {
      const previewHash = await getPreviewHash({ profile: "canonico" });

      previsualizarImportacionCsv.mockResolvedValueOnce({
        totalFilas: 1,
        filasValidas: [],
        erroresFila: [],
        plan: [],
        resumen: { crear: 0, actualizar: 0, bloqueado: 0 },
        erroresGlobales: ["Hay más de 12 productos destacados."]
      });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "canonico",
          previewHash
        })
      );

      expect(response.status).toBe(400);
      expect(confirmarImportacionCsv).not.toHaveBeenCalled();
    });
  });

  describe("perfil proveedor", () => {
    it("action=preview con perfil proveedor devuelve porcentaje aplicado y plan (sin ejecutar el asistente de calidad)", async () => {
      const response = await POST(
        makeRequest({
          action: "preview",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.perfil).toBe("proveedor");
      expect(data.preview.porcentajeAplicado).toBe(35);
      expect(data.preview.plan[0].precioVenta).toBe(78300);
      expect(previsualizarImportacionProveedor).toHaveBeenCalledTimes(1);
      expect(revisarCalidadImportacionProveedor).not.toHaveBeenCalled();
    });

    it("action=quality-review devuelve hallazgos y reviewHash cuando el previewHash coincide", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });

      const response = await POST(
        makeRequest({
          action: "quality-review",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data.findings)).toBe(true);
      expect(typeof data.reviewHash).toBe("string");
      expect(revisarCalidadImportacionProveedor).toHaveBeenCalledTimes(1);
    });

    it("action=quality-review se rechaza con 409 si el previewHash no coincide", async () => {
      const response = await POST(
        makeRequest({
          action: "quality-review",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash: "hash-invalido"
        })
      );

      expect(response.status).toBe(409);
      expect(revisarCalidadImportacionProveedor).not.toHaveBeenCalled();
    });

    it("action=final-plan devuelve el plan resuelto SIN escribir (no llama confirmarImportacionProveedor)", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });
      const reviewHash = await getReviewHash(previewHash, { markupPercentage: 35 });

      const response = await POST(
        makeRequest({
          action: "final-plan",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash,
          reviewHash,
          decisions: []
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.plan).toHaveLength(1);
      expect(construirPlanConDecisiones).toHaveBeenCalledTimes(1);
      expect(confirmarImportacionProveedor).not.toHaveBeenCalled();
    });

    it("action=confirm ejecuta confirmarImportacionProveedor cuando previewHash y reviewHash coinciden", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });
      const reviewHash = await getReviewHash(previewHash, { markupPercentage: 35 });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash,
          reviewHash,
          decisions: []
        })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.creados).toBe(1);
      expect(construirPlanConDecisiones).toHaveBeenCalledTimes(1);
      expect(confirmarImportacionProveedor).toHaveBeenCalledTimes(1);
    });

    it("cambiar el porcentaje entre preview y confirm invalida el hash (409, sin escritura)", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 40, // distinto al usado en el preview
          previewHash
        })
      );

      expect(response.status).toBe(409);
      expect(confirmarImportacionProveedor).not.toHaveBeenCalled();
    });

    it("confirmar sin pasar por quality-review (reviewHash ausente/invalido) se rechaza con 409", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash,
          reviewHash: "hash-invalido"
        })
      );

      expect(response.status).toBe(409);
      expect(confirmarImportacionProveedor).not.toHaveBeenCalled();
    });

    it("un decision.findingId que no existe en la revision actual se rechaza con 409 (revision cambio)", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });
      const reviewHash = await getReviewHash(previewHash, { markupPercentage: 35 });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash,
          reviewHash,
          decisions: [{ findingId: "NO_EXISTE:1", optionId: "IGNORE_WARNING" }]
        })
      );

      expect(response.status).toBe(409);
      expect(confirmarImportacionProveedor).not.toHaveBeenCalled();
    });

    it("conflictos bloqueantes sin resolver impiden confirmar (400, sin escritura)", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });
      const reviewHash = await getReviewHash(previewHash, { markupPercentage: 35 });

      construirPlanConDecisiones.mockResolvedValueOnce({
        review: { findings: [], summary: {} },
        applied: {
          plan: [],
          unresolvedBlockers: [{ id: "EXACT_DUPLICATE:2|3", type: "EXACT_DUPLICATE", severity: "BLOCKER" }],
          errors: []
        }
      });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash,
          reviewHash,
          decisions: []
        })
      );

      expect(response.status).toBe(400);
      expect(confirmarImportacionProveedor).not.toHaveBeenCalled();
    });

    it("un producto existente seleccionado que ya no existe se rechaza con 409", async () => {
      const previewHash = await getPreviewHash({ profile: "proveedor", markupPercentage: 35 });

      const findingStub = {
        id: "x",
        type: "EXISTING_CATALOG_MATCH",
        severity: "WARNING",
        rowNumbers: [2],
        rows: [],
        options: []
      };
      revisarCalidadImportacionProveedor.mockResolvedValueOnce({
        findings: [findingStub],
        summary: {
          filasFisicas: 1,
          filasVacias: 0,
          filasUtiles: 1,
          normalizacionesSeguras: 0,
          variantesDetectadas: 0,
          posiblesDuplicados: 0,
          coincidenciasCatalogoExistente: 1,
          incoherenciasNombreOMarca: 0,
          advertenciasCosto: 0,
          conflictosPendientes: 0
        },
        normalizedRows: []
      });
      const reviewHash = await getReviewHash(previewHash, { markupPercentage: 35 });
      // La accion quality-review anterior consumio el mock "once"; se
      // reafirma la MISMA respuesta para que confirm vea el mismo hallazgo.
      revisarCalidadImportacionProveedor.mockResolvedValueOnce({
        findings: [findingStub],
        summary: {
          filasFisicas: 1,
          filasVacias: 0,
          filasUtiles: 1,
          normalizacionesSeguras: 0,
          variantesDetectadas: 0,
          posiblesDuplicados: 0,
          coincidenciasCatalogoExistente: 1,
          incoherenciasNombreOMarca: 0,
          advertenciasCosto: 0,
          conflictosPendientes: 0
        },
        normalizedRows: []
      });

      const response = await POST(
        makeRequest({
          action: "confirm",
          fileName: "a.csv",
          fileBase64: FAKE_FILE_BASE64,
          profile: "proveedor",
          markupPercentage: 35,
          previewHash,
          reviewHash,
          decisions: [{ findingId: "x", optionId: "UPDATE_EXISTING", targetProductId: "no-existe" }]
        })
      );

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toMatch(/producto existente seleccionado ya no existe/i);
      expect(confirmarImportacionProveedor).not.toHaveBeenCalled();
    });
  });
});
