import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createProductoService } from "@/services/productoService";

const MAX_BASE64_LENGTH = 3 * 1024 * 1024; // ~2.2 MiB de archivo original

type ImportRequestBody = {
  action?: "preview" | "confirm";
  fileName?: string;
  fileBase64?: string;
};

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

    const productoService = createProductoService();
    const preview = await productoService.previsualizarImportacionCsv(buffer, fileName, buffer.length);

    if (action === "preview") {
      return NextResponse.json({ preview });
    }

    // action === "confirm": solo se escriben las filas ya validadas, y solo
    // si no hay errores globales bloqueantes (ej. mas de 12 destacados).
    if (preview.erroresGlobales.length > 0) {
      return NextResponse.json(
        { error: "No se puede confirmar: hay errores globales pendientes.", preview },
        { status: 400 }
      );
    }

    if (preview.filasValidas.length === 0) {
      return NextResponse.json(
        { error: "No hay filas válidas para importar.", preview },
        { status: 400 }
      );
    }

    const result = await productoService.confirmarImportacionCsv(preview.filasValidas);
    return NextResponse.json({ ok: true, ...result, preview });
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
