import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { httpStatusForPerfumeOrderError } from "@/lib/perfumeOrderErrors";
import type { AdminDirectSaleRequest } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

const DIRECT_SALE_FIELDS = new Set([
  "clienteId",
  "nombre",
  "telefono",
  "lugarTrabajo",
  "items",
  "estadoPago",
  "formaPago",
  "clienteModo",
  "observacion",
  "idempotencyKey"
]);

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);

  if (trustedOriginError) {
    return trustedOriginError;
  }

  const jsonRequestError = validateJsonRequest(request);

  if (jsonRequestError) {
    return jsonRequestError;
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo JSON no es valido." }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "El cuerpo debe ser un objeto JSON." }, { status: 400 });
  }

  const unknownFields = Object.keys(rawBody).filter((key) => !DIRECT_SALE_FIELDS.has(key));

  if (unknownFields.length > 0) {
    return NextResponse.json(
      { error: `Campos no permitidos: ${unknownFields.join(", ")}.` },
      { status: 400 }
    );
  }

  if (!("idempotencyKey" in rawBody) || typeof (rawBody as { idempotencyKey?: unknown }).idempotencyKey !== "string") {
    return NextResponse.json({ error: "Falta idempotencyKey." }, { status: 400 });
  }

  try {
    const body = rawBody as AdminDirectSaleRequest;
    const pedidoService = createPedidoService();
    const result = await pedidoService.crearVentaDirecta(body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar la venta directa."
      },
      { status: httpStatusForPerfumeOrderError(error) }
    );
  }
}
