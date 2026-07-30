import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";
import { parseCsvLines, detectEncoding, decodeBuffer, detectDelimiter } from "@/lib/catalog-import/index.ts";
import { detectImportProfile } from "@/lib/catalog-import/supplier-import.ts";

const MAX_BASE64_LENGTH = 3 * 1024 * 1024; // ~2.2 MiB de archivo original

type ImportProfileParam = "auto" | "proveedor" | "canonico";

type ImportRequestBody = {
  action?: "preview" | "confirm";
  fileName?: string;
  fileBase64?: string;
  profile?: ImportProfileParam;
  markupPercentage?: number;
  previewHash?: string;
};

function computePreviewHash(buffer: Buffer, profile: string, markupPercentage: unknown): string {
  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const percentagePart = markupPercentage === undefined || markupPercentage === null ? "" : String(markupPercentage);
  return crypto.createHash("sha256").update(`${fileHash}:${profile}:${percentagePart}`).digest("hex");
}

function resolveProfile(buffer: Buffer, requested: ImportProfileParam | undefined): "proveedor" | "canonico" | null {
  if (requested === "proveedor" || requested === "canonico") return requested;

  const encoding = detectEncoding(buffer);
  const text = decodeBuffer(buffer, encoding);
  const delimiter = detectDelimiter(text);
  const matrix = parseCsvLines(text, delimiter);
  if (matrix.length === 0) return null;

  return detectImportProfile(matrix[0]);
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);
  if (trustedOriginError) return trustedOriginError;

  const jsonRequestError = validateJsonRequest(request);
  if (jsonRequestError) return jsonRequestError;

  try {
    const body = (await request.json()) as ImportRequestBody;
    const action = body.action === "confirm" ? "confirm" : "preview";
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";
    const requestedProfile: ImportProfileParam | undefined =
      body.profile === "proveedor" || body.profile === "canonico" ? body.profile : "auto";
    const markupPercentage = body.markupPercentage;

    if (!fileName || !fileBase64) {
      return NextResponse.json({ error: "Falta el archivo a importar." }, { status: 400 });
    }

    if (fileBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: "El archivo supera el tamaño máximo permitido." }, { status: 413 });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(fileBase64, "base64");
    } catch {
      return NextResponse.json({ error: "El archivo no pudo ser leído." }, { status: 400 });
    }

    const profile = resolveProfile(buffer, requestedProfile === "auto" ? undefined : requestedProfile);

    if (!profile) {
      return NextResponse.json(
        {
          error:
            "No se pudo detectar un perfil de importación válido para este archivo. Selecciona manualmente 'CSV de proveedor' o 'Catálogo canónico'."
        },
        { status: 400 }
      );
    }

    const productoService = createProductoService();

    if (profile === "proveedor") {
      const requestedMarkup = markupPercentage ?? 35;
      const preview = await productoService.previsualizarImportacionProveedor(
        buffer,
        fileName,
        buffer.length,
        requestedMarkup
      );
      // El hash se ata al porcentaje SOLICITADO (no al ya validado por el
      // servicio) para que cualquier cambio de input entre preview y
      // confirm quede detectado, incluso si ambos valores fueran invalidos.
      const previewHash = computePreviewHash(buffer, "proveedor", requestedMarkup);

      if (action === "preview") {
        return NextResponse.json({ perfil: "proveedor", previewHash, preview });
      }

      if (body.previewHash !== previewHash) {
        return NextResponse.json(
          {
            error:
              "El archivo o el porcentaje de recargo cambiaron respecto a la vista previa. Genera una vista previa nueva antes de confirmar."
          },
          { status: 409 }
        );
      }

      if (preview.erroresGlobales.length > 0) {
        return NextResponse.json(
          { error: "No se puede confirmar: hay errores globales pendientes.", preview },
          { status: 400 }
        );
      }

      if (preview.plan.length === 0) {
        return NextResponse.json({ error: "No hay filas válidas para importar.", preview }, { status: 400 });
      }

      const result = await productoService.confirmarImportacionProveedor(preview.plan);
      return NextResponse.json({ ok: true, ...result, perfil: "proveedor", preview });
    }

    // perfil canonico
    const preview = await productoService.previsualizarImportacionCsv(buffer, fileName, buffer.length);
    const previewHash = computePreviewHash(buffer, "canonico", "");

    if (action === "preview") {
      return NextResponse.json({ perfil: "canonico", previewHash, preview });
    }

    if (body.previewHash !== previewHash) {
      return NextResponse.json(
        {
          error: "El archivo cambió respecto a la vista previa. Genera una vista previa nueva antes de confirmar."
        },
        { status: 409 }
      );
    }

    if (preview.erroresGlobales.length > 0) {
      return NextResponse.json(
        { error: "No se puede confirmar: hay errores globales pendientes.", preview },
        { status: 400 }
      );
    }

    if (preview.filasValidas.length === 0) {
      return NextResponse.json({ error: "No hay filas válidas para importar.", preview }, { status: 400 });
    }

    const result = await productoService.confirmarImportacionCsv(preview.filasValidas);
    return NextResponse.json({ ok: true, ...result, perfil: "canonico", preview });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible procesar la importación."
      },
      { status: 400 }
    );
  }
}
