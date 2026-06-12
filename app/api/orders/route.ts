import { NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import type { CustomerOrderRequest } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CustomerOrderRequest;

    if (body.contactoOculto?.trim()) {
      return NextResponse.json(
        { error: "No fue posible registrar el pedido." },
        { status: 400 }
      );
    }

    const ip = getRequestIp(request);
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
