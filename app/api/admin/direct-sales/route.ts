import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import type { AdminDirectSaleRequest } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

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

  try {
    const body = (await request.json()) as AdminDirectSaleRequest;
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
      { status: 400 }
    );
  }
}
