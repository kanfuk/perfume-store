import { NextResponse } from "next/server";
import { parseChileanMobilePhone } from "@/lib/chile-phone";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { CustomerOrderRequest } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Formato de solicitud no soportado." },
        { status: 415 }
      );
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
          error: "Se alcanzo el limite temporal de intentos. Intenta de nuevo en unos minutos."
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
              "Ya recibimos varios intentos para este numero. Espera unos minutos antes de reenviar."
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar el pedido."
      },
      { status: 400 }
    );
  }
}
