import { NextResponse } from "next/server";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { httpStatusForPerfumeOrderError } from "@/lib/perfumeOrderErrors";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { CustomerOrderRequest } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

export async function POST(request: Request) {
  try {
    const trustedOriginError = validateTrustedOrigin(request);

    if (trustedOriginError) {
      return trustedOriginError;
    }

    const jsonRequestError = validateJsonRequest(request);

    if (jsonRequestError) {
      return jsonRequestError;
    }

    const body = (await request.json()) as CustomerOrderRequest;

    if (body.contactoOculto?.trim()) {
      return NextResponse.json(
        { error: "No fue posible registrar el pedido." },
        { status: 400 }
      );
    }

    const ip = getRequestIp(request);
    const phone = parseChileanMobilePhone(body.telefono);
    const rateLimit = checkRateLimit({
      key: `create-order:${ip}`,
      maxRequests: 5,
      windowMs: 10 * 60 * 1000
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Se alcanzó el límite temporal de intentos. Intenta de nuevo en unos minutos."
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000))
          }
        }
      );
    }

    if (phone) {
      const phoneRateLimit = checkRateLimit({
        key: `create-order-phone:${phone.e164}`,
        maxRequests: 3,
        windowMs: 10 * 60 * 1000
      });

      if (!phoneRateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "Ya recibimos varios intentos para este número. Espera unos minutos antes de reenviar."
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.ceil((phoneRateLimit.resetAt - Date.now()) / 1000)
              )
            }
          }
        );
      }
    }

    const pedidoService = createPedidoService();
    const result = await pedidoService.crearPedido(body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // Los errores de la RPC create_perfume_order_v1 ya llegan aqui
    // traducidos a espanol y sin detalles internos de PostgreSQL (ver
    // repositories/pedidoRepository.ts + lib/perfumeOrderErrors.ts).
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar el pedido."
      },
      { status: httpStatusForPerfumeOrderError(error) }
    );
  }
}
